import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Modal,
  Image,
  RefreshControl,
} from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import {
  Users,
  UserPlus,
  Sparkles,
  Pencil,
  Trash2,
  Camera as CameraIcon,
  X,
  User as UserIcon,
  Mail,
} from 'lucide-react-native';
import { useAuth } from './AuthContext';
import { apiService, type Student } from './services/api';
import ImagePicker from 'react-native-image-crop-picker';
import { showToast } from './utils/toast';
import {
  Screen,
  AppHeader,
  Button,
  Card,
  Input,
  EmptyState,
  SkeletonCard,
  ConfirmSheet,
  useTheme,
} from './components/ui';
import type { AppTheme } from './components/ui';

export const StudentManagementScreen: React.FC = () => {
  const { user: _user } = useAuth();
  const { theme } = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCreateDefaultConfirm, setShowCreateDefaultConfirm] = useState(false);
  const [isCreatingDefault, setIsCreatingDefault] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
  });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStudents = async () => {
    try {
      setIsLoading(true);
      await apiService.debugTokenStatus();

      const response = await apiService.getStudents();

      if (response.success && response.data) {
        // Ensure we have an array of students
        if (Array.isArray(response.data)) {
          setStudents(response.data);
        } else {
          setStudents([]);
        }
      } else {
        console.error('Failed to load students:', response.error);
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to load students',
        });
        setStudents([]);
      }
    } catch (error) {
      console.error('Error loading students:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to load students' });
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadStudents();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddStudent = async () => {
    if (formData.name.trim() === '' || formData.email.trim() === '') {
      showToast({ type: 'warning', title: 'Missing fields', message: 'Please fill in all fields' });
      return;
    }

    try {
      setIsLoading(true);
      await apiService.debugTokenStatus();

      const studentData = {
        name: formData.name.trim(),
        email: formData.email.trim(),
      };

      const response = await apiService.addStudent(studentData);

      // Extract the student object from response.data
      let student: any = (response.data as any)?.student || response.data;

      if (!response.success || !student || !student.id) {
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to add student: ' + (response.error || 'Unknown error'),
        });
        setIsLoading(false);
        return;
      }

      // If image was selected, upload it for the student
      if (selectedImage && student.id) {
        try {
          const imageResponse = await apiService.uploadStudentFace(student.id, {
            uri: selectedImage,
            type: 'image/jpeg',
            name: 'student_face.jpg',
          } as any);

          if (imageResponse.success && imageResponse.data) {
            // Use the updated student object from the image upload response
            student = (imageResponse.data as any).student || imageResponse.data;
          }
        } catch (imageError) {
          console.warn('Error uploading face image:', imageError);
        }
      } else if (selectedImage && !student.id) {
        console.warn('Cannot upload image: Student ID is missing');
      }
      if (typeof student === 'object' && student !== null) {
        if (student._id && !student.id) {
          student.id = student._id;
        }

        if (student.id) {
          setStudents(prevStudents =>
            Array.isArray(prevStudents) ? [student, ...prevStudents] : [student]
          );
          setShowAddModal(false);
          setFormData({ name: '', email: '' });
          setSelectedImage(null);
          showToast({ type: 'success', title: 'Success', message: 'Student added successfully' });
        } else {
          console.error('Student object missing ID:', student);
          showToast({
            type: 'error',
            title: 'Error',
            message: 'Failed to add student: Missing ID',
          });
        }
      }
    } catch (error) {
      console.error('Error adding student:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast({
        type: 'error',
        title: 'Error',
        message: `Failed to add student: ${errorMessage}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const performCreateDefaultStudent = async () => {
    try {
      setIsCreatingDefault(true);
      await apiService.debugTokenStatus();

      const response = await apiService.createDefaultStudent();

      if (response.success && response.data) {
        // Ensure response.data is a valid student object before spreading
        if (response.data && typeof response.data === 'object' && response.data.id) {
          setStudents([response.data, ...students]);
          showToast({
            type: 'success',
            title: 'Success',
            message: 'Default student (Ankush) created successfully with face data!',
          });
        } else {
          showToast({
            type: 'error',
            title: 'Error',
            message: 'Invalid student data received from server',
          });
        }
      } else {
        console.error('Failed to create default student:', response.error);
        const errorMessage = response.error || 'Failed to create default student';

        if (errorMessage.includes('already exists')) {
          showToast({ type: 'info', title: 'Info', message: 'Default student already exists' });
        } else {
          showToast({ type: 'error', title: 'Error', message: errorMessage });
        }
      }
    } catch (error) {
      console.error('Error creating default student:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast({
        type: 'error',
        title: 'Error',
        message: `Failed to create default student: ${errorMessage}`,
      });
    } finally {
      setIsCreatingDefault(false);
      setShowCreateDefaultConfirm(false);
    }
  };

  const handleEditStudent = async () => {
    if (!selectedStudent || (!formData.name.trim() && !formData.email.trim())) {
      showToast({
        type: 'warning',
        title: 'Missing fields',
        message: 'Please fill in at least one field',
      });
      return;
    }

    try {
      setIsLoading(true);
      const updateData: any = {};
      if (formData.name.trim()) updateData.name = formData.name.trim();
      if (formData.email.trim()) updateData.email = formData.email.trim();

      const response = await apiService.updateStudent(selectedStudent.id, updateData);

      if (response.success && response.data) {
        setStudents(students.map(s => s.id === selectedStudent.id ? response.data! : s));
        setShowEditModal(false);
        setSelectedStudent(null);
        setFormData({ name: '', email: '' });
        showToast({ type: 'success', title: 'Success', message: 'Student updated successfully' });
      } else {
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to update student',
        });
      }
    } catch (error) {
      console.error('Error updating student:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to update student' });
    } finally {
      setIsLoading(false);
    }
  };

  const performDeleteStudent = async (student: Student) => {
    try {
      setIsDeleting(true);
      const response = await apiService.deleteStudent(student.id);

      if (response.success) {
        setStudents(students.filter(s => s.id !== student.id));
        showToast({ type: 'success', title: 'Success', message: 'Student deleted successfully' });
      } else {
        showToast({
          type: 'error',
          title: 'Error',
          message: response.error || 'Failed to delete student',
        });
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      showToast({ type: 'error', title: 'Error', message: 'Failed to delete student' });
    } finally {
      setIsDeleting(false);
      setStudentToDelete(null);
    }
  };

  const openEditModal = (student: Student) => {
    setSelectedStudent(student);
    setFormData({
      name: student.name,
      email: student.email ?? '',
    });
    setShowEditModal(true);
  };

  const handleSelectImage = async () => {
    try {
      const image = await ImagePicker.openPicker({
        mediaType: 'photo',
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: false,
      });

      setSelectedImage(image.path);
    } catch (error: any) {
      if (error.code !== 'E_PICKER_CANCELLED') {
        console.error('Image picker error:', error);
        showToast({ type: 'error', title: 'Error', message: 'Failed to select image' });
      }
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
  };

  const renderStudentItem = ({ item, index }: { item: Student; index: number }) => (
    <Card
      elevation={1}
      enteringIndex={index}
      style={styles.studentCard}
      accessibilityLabel={`Student ${item.name}`}
    >
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentEmail}>{item.email}</Text>
        <Text style={styles.studentDate}>
          Added: {new Date(item.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.studentActions}>
        <Button
          title="Edit"
          icon={Pencil}
          variant="outline"
          size="sm"
          onPress={() => openEditModal(item)}
          accessibilityLabel={`Edit student ${item.name}`}
        />
        <Button
          title="Delete"
          icon={Trash2}
          variant="danger"
          size="sm"
          onPress={() => setStudentToDelete(item)}
          accessibilityLabel={`Delete student ${item.name}`}
        />
      </View>
    </Card>
  );

  return (
    <Screen testID="student-management-screen">
      <AppHeader
        title="Student Management"
        rightIcon={UserPlus}
        onRightPress={() => setShowAddModal(true)}
        rightAccessibilityLabel="Add a new student"
      />

      <Animated.View entering={FadeInDown.duration(300)} style={styles.headerActions}>
        <Button
          title="Add Student"
          icon={UserPlus}
          size="sm"
          onPress={() => setShowAddModal(true)}
          accessibilityLabel="Add a new student"
          style={styles.headerActionButton}
        />
        <Button
          title="Create Ankush"
          icon={Sparkles}
          variant="secondary"
          size="sm"
          onPress={() => setShowCreateDefaultConfirm(true)}
          accessibilityLabel="Create default student Ankush"
          style={styles.headerActionButton}
        />
      </Animated.View>

      {isLoading && !isRefreshing ? (
        <View style={styles.skeletonContainer}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </View>
      ) : (
        <Animated.FlatList
          data={students}
          renderItem={renderStudentItem}
          keyExtractor={(item) => item.id}
          itemLayoutAnimation={LinearTransition.duration(250)}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.brand}
              colors={[theme.colors.brand]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="No students found"
              message="Add your first student to get started"
              actionLabel="Add Student"
              onAction={() => setShowAddModal(true)}
            />
          }
        />
      )}

      {/* Delete confirmation */}
      <ConfirmSheet
        visible={studentToDelete !== null}
        title="Delete Student"
        message={`Are you sure you want to delete ${studentToDelete?.name ?? 'this student'}? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={isDeleting}
        icon={Trash2}
        onConfirm={() => {
          if (studentToDelete) {
            performDeleteStudent(studentToDelete);
          }
        }}
        onCancel={() => setStudentToDelete(null)}
      />

      {/* Create default student confirmation */}
      <ConfirmSheet
        visible={showCreateDefaultConfirm}
        title="Create Default Student"
        message='This will create a default student named "Ankush" with sample face data for testing. Continue?'
        confirmLabel="Create"
        cancelLabel="Cancel"
        loading={isCreatingDefault}
        icon={Sparkles}
        onConfirm={performCreateDefaultStudent}
        onCancel={() => setShowCreateDefaultConfirm(false)}
      />

      {/* Add Student Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Student</Text>
            <TouchableOpacity
              onPress={() => {
                setShowAddModal(false);
                setFormData({ name: '', email: '' });
                setSelectedImage(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Close add student form"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.modalCloseButton}
            >
              <X size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Input
              label="Student Name"
              icon={UserIcon}
              placeholder="Student Name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              autoCapitalize="words"
            />
            <Input
              label="Student Email"
              icon={Mail}
              placeholder="Student Email"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Face Image Upload Section */}
            <View style={styles.imageSection}>
              <Text style={styles.imageSectionTitle}>Face Image (Optional)</Text>
              <Text style={styles.imageSectionSubtitle}>
                Upload a clear photo of the student's face for authentication
              </Text>

              {selectedImage ? (
                <View style={styles.selectedImageContainer}>
                  <Image
                    source={{ uri: selectedImage }}
                    style={styles.selectedImage}
                    accessibilityLabel="Selected student face image"
                  />
                  <Button
                    title="Remove"
                    icon={Trash2}
                    variant="danger"
                    size="sm"
                    onPress={handleRemoveImage}
                    accessibilityLabel="Remove selected face image"
                  />
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.selectImageButton}
                  onPress={handleSelectImage}
                  accessibilityRole="button"
                  accessibilityLabel="Select face image"
                >
                  <CameraIcon size={20} color={theme.colors.textMuted} />
                  <Text style={styles.selectImageButtonText}>Select Face Image</Text>
                </TouchableOpacity>
              )}
            </View>

            <Button
              title="Add Student"
              icon={UserPlus}
              fullWidth
              onPress={handleAddStudent}
              loading={isLoading}
              disabled={isLoading}
              accessibilityLabel="Add student"
              style={styles.submitButton}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Student Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Edit Student</Text>
            <TouchableOpacity
              onPress={() => {
                setShowEditModal(false);
                setSelectedStudent(null);
                setFormData({ name: '', email: '' });
              }}
              accessibilityRole="button"
              accessibilityLabel="Close edit student form"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.modalCloseButton}
            >
              <X size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Input
              label="Student Name"
              icon={UserIcon}
              placeholder="Student Name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              autoCapitalize="words"
            />
            <Input
              label="Student Email"
              icon={Mail}
              placeholder="Student Email"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Button
              title="Update Student"
              icon={Pencil}
              fullWidth
              onPress={handleEditStudent}
              loading={isLoading}
              disabled={isLoading}
              accessibilityLabel="Update student"
              style={styles.submitButton}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
};

const createStyles = (theme: AppTheme) => {
  const { colors, spacing, radii, typography } = theme;
  return StyleSheet.create({
    headerActions: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    headerActionButton: {
      flex: 1,
    },
    skeletonContainer: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    listContainer: {
      padding: spacing.lg,
      flexGrow: 1,
    },
    studentCard: {
      marginBottom: spacing.md,
    },
    studentInfo: {
      marginBottom: spacing.md,
    },
    studentName: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    studentEmail: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    studentDate: {
      ...typography.caption,
      color: colors.textMuted,
    },
    studentActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.sm,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      ...typography.h3,
      color: colors.text,
    },
    modalCloseButton: {
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalContent: {
      padding: spacing.lg,
    },
    submitButton: {
      marginTop: spacing.sm,
    },
    // Image upload styles
    imageSection: {
      marginBottom: spacing.xl,
    },
    imageSectionTitle: {
      ...typography.title,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    imageSectionSubtitle: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: spacing.lg,
    },
    selectImageButton: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
      borderRadius: radii.md,
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    selectImageButtonText: {
      ...typography.bodyBold,
      color: colors.textMuted,
    },
    selectedImageContainer: {
      alignItems: 'center',
      gap: spacing.md,
    },
    selectedImage: {
      width: 120,
      height: 120,
      borderRadius: radii.pill,
      borderWidth: 2,
      borderColor: colors.brand,
    },
  });
};
