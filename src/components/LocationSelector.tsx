import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { CustomColors as colors } from '../colors';
import { apiService } from '../services/api';

interface Location {
  _id: string;
  name: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  geofenceRadius: number;
  workingHours: {
    start: string;
    end: string;
  };
  description?: string;
  isCurrent: boolean;
  isPrimary: boolean;
  isActive: boolean;
}

interface LocationSelectorProps {
  onLocationChange?: (location: Location) => void;
  currentLocation?: Location | null;
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
  onLocationChange,
  currentLocation,
}) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      console.log('Loading student locations...');
      const response = await apiService.getStudentLocations();
      console.log('Student locations response:', response);
      if (response.success && response.data) {
        setLocations(Array.isArray(response.data) ? response.data : []);
      } else {
        console.error('Failed to load locations:', response.error);
        setLocations([]);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      setLocations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSelect = async (location: Location) => {
    if (location.isCurrent) {
      setModalVisible(false);
      return;
    }

    Alert.alert(
      'Change Location',
      `Do you want to change your location to ${location.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: () => requestLocationChange(location),
        },
      ]
    );
  };

  const requestLocationChange = async (location: Location) => {
    try {
      setRequesting(true);
      
      // Show reason input dialog
      Alert.prompt(
        'Reason for Location Change',
        'Please provide a reason for changing your location:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit',
            onPress: async (reason) => {
              if (!reason?.trim()) {
                Alert.alert('Error', 'Please provide a reason');
                return;
              }

              try {
                const response = await apiService.requestLocationChange(location._id, reason.trim());
                
                if (response.success) {
                  if (response.data.requiresApproval) {
                    Alert.alert(
                      'Request Submitted',
                      'Your location change request has been submitted for approval.'
                    );
                  } else {
                    Alert.alert(
                      'Location Changed',
                      'Your location has been changed successfully.'
                    );
                    loadLocations(); // Refresh locations
                    onLocationChange?.(location);
                  }
                  setModalVisible(false);
                }
              } catch (error: any) {
                Alert.alert(
                  'Error',
                  error.response?.data?.error || 'Failed to request location change'
                );
              }
            },
          },
        ],
        'plain-text'
      );
    } catch (error) {
      console.error('Error requesting location change:', error);
    } finally {
      setRequesting(false);
    }
  };

  const formatAddress = (address: Location['address']) => {
    const parts = [address.city, address.state].filter(Boolean);
    return parts.join(', ') || 'No address provided';
  };

  const getCurrentLocationName = () => {
    if (currentLocation) {
      return currentLocation.name;
    }
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return 'Select Location';
    }
    const current = locations.find(loc => loc.isCurrent);
    return current?.name || 'Select Location';
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.selectorButton}
        onPress={() => setModalVisible(true)}
        disabled={loading}
      >
        <View style={styles.selectorContent}>
          <Ionicons name="location" size={20} color={colors.primary} />
          <View style={styles.locationInfo}>
            <Text style={styles.locationName}>{getCurrentLocationName()}</Text>
            <Text style={styles.locationSubtext}>
              {currentLocation ? `${currentLocation.geofenceRadius}m radius` : 'Tap to select'}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>

      
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  selectorButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  locationName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  locationSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  locationsList: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  locationItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentLocationItem: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  locationItemContent: {
    flex: 1,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  locationItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  currentLocationText: {
    color: colors.primary,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  primaryBadge: {
    backgroundColor: colors.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  currentBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  locationAddress: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  locationDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  locationDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default LocationSelector;