import React, { useState, useEffect } from 'react';
import { Plus, X, Save, Edit2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const BureauManagement = ({ organization, onUpdate }) => {
  const [bureaus, setBureaus] = useState([]);
  const [newBureau, setNewBureau] = useState('');
  const [editingIndex, setEditingIndex] = useState(-1);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (organization?.bureaus) {
      setBureaus(organization.bureaus);
    }
  }, [organization]);

  const addBureau = () => {
    if (!newBureau.trim()) {
      toast.error('Please enter a bureau name');
      return;
    }
    
    if (bureaus.includes(newBureau.trim())) {
      toast.error('Bureau already exists');
      return;
    }

    const updatedBureaus = [...bureaus, newBureau.trim()];
    setBureaus(updatedBureaus);
    setNewBureau('');
    saveBureaus(updatedBureaus);
  };

  const removeBureau = (index) => {
    const updatedBureaus = bureaus.filter((_, i) => i !== index);
    setBureaus(updatedBureaus);
    saveBureaus(updatedBureaus);
  };

  const startEditing = (index) => {
    setEditingIndex(index);
    setEditValue(bureaus[index]);
  };

  const saveEdit = () => {
    if (!editValue.trim()) {
      toast.error('Bureau name cannot be empty');
      return;
    }

    if (bureaus.includes(editValue.trim()) && bureaus.indexOf(editValue.trim()) !== editingIndex) {
      toast.error('Bureau already exists');
      return;
    }

    const updatedBureaus = [...bureaus];
    updatedBureaus[editingIndex] = editValue.trim();
    setBureaus(updatedBureaus);
    setEditingIndex(-1);
    setEditValue('');
    saveBureaus(updatedBureaus);
  };

  const cancelEdit = () => {
    setEditingIndex(-1);
    setEditValue('');
  };

  const saveBureaus = async (bureauList) => {
    setLoading(true);
    try {
      const response = await axios.put('/api/organization/bureaus', {
        bureaus: bureauList
      });
      
      toast.success('Bureaus updated successfully');
      if (onUpdate) {
        onUpdate(response.data.organization);
      }
    } catch (error) {
      console.error('Error updating bureaus:', error);
      toast.error(error.response?.data?.message || 'Failed to update bureaus');
      // Revert changes on error
      setBureaus(organization?.bureaus || []);
    } finally {
      setLoading(false);
    }
  };

  if (organization?.organizationType !== 'government_office') {
    return null;
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="text-lg font-medium text-gray-900">Manage Bureaus/Cells</h3>
        <p className="text-sm text-gray-600">
          Add, edit, or remove bureaus and cells for your government organization
        </p>
      </div>
      <div className="card-body">
        {/* Add new bureau */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newBureau}
            onChange={(e) => setNewBureau(e.target.value)}
            placeholder="Enter bureau/cell name"
            className="flex-1 input-field"
            onKeyPress={(e) => e.key === 'Enter' && addBureau()}
          />
          <button
            onClick={addBureau}
            disabled={loading}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        {/* Bureau list */}
        <div className="space-y-2">
          {bureaus.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No bureaus added yet</p>
          ) : (
            bureaus.map((bureau, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                {editingIndex === index ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 input-field"
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                      autoFocus
                    />
                    <button
                      onClick={saveEdit}
                      disabled={loading}
                      className="btn btn-success btn-sm"
                    >
                      <Save className="h-4 w-4" />
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={loading}
                      className="btn btn-secondary btn-sm"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-gray-900">{bureau}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditing(index)}
                        disabled={loading}
                        className="btn btn-outline btn-sm"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeBureau(index)}
                        disabled={loading}
                        className="btn btn-danger btn-sm"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center mt-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BureauManagement; 