import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StudentRegistrationForm from './StudentRegistrationForm';

const RegisterStudent = () => {
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(true);
  const [success, setSuccess] = useState(false);

  const renderOrganizationDetails = () => (
    <div className="mb-6 p-4 bg-gray-100 rounded-lg">
      <h2 className="text-xl font-bold mb-2">Organization Details</h2>
      <div className="text-gray-700">
        <div><strong>Name:</strong> {user?.organizationName || 'N/A'}</div>
        <div><strong>Type:</strong> {user?.organizationType || 'N/A'}</div>
        {user?.organizationType === 'school' || user?.organizationType === 'institute' ? (
          <div><strong>Classes:</strong> {user?.classes?.join(', ') || 'N/A'}</div>
        ) : null}
        {user?.organizationType === 'private_company' ? (
          <div><strong>Departments:</strong> {user?.departments?.join(', ') || 'N/A'}</div>
        ) : null}
        {user?.organizationType === 'government_office' ? (
          <div><strong>Bureaus:</strong> {user?.bureaus?.join(', ') || 'N/A'}</div>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-6">
        {/* {renderOrganizationDetails()} */}
        {showForm && !success && (
          <StudentRegistrationForm
            user={user}
            editingStudent={null}
            onClose={() => setShowForm(false)}
            onSuccess={() => {
              setSuccess(true);
              setShowForm(false);
            }}
          />
        )}
        {success && (
          <div className="text-center py-12">
            <h3 className="text-lg font-bold text-success-700 mb-2">Registration Successful!</h3>
            <p className="text-gray-700">Thank you for registering. Your details have been submitted.</p>
          </div>
        )}
        {!showForm && !success && (
          <div className="text-center py-12">
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              Register Another Student
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterStudent;

