import React from 'react';
import { X, Calendar, FileText, Clock, MapPin, UserCheck } from 'lucide-react';
import { EmptyState } from '../ui';

const LeaveDetailsModal = ({ 
  isOpen, 
  onClose, 
  title, 
  requests, 
  type = 'leave' // 'leave' or 'checkout'
}) => {
  if (!isOpen) return null;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return 'bg-success-100 text-success-800 border-success-200 dark:bg-success-900/40 dark:text-success-300 dark:border-success-800';
      case 'pending':
        return 'bg-warning-100 text-warning-800 border-warning-200 dark:bg-warning-900/40 dark:text-warning-300 dark:border-warning-800';
      case 'rejected':
        return 'bg-danger-100 text-danger-800 border-danger-200 dark:bg-danger-900/40 dark:text-danger-300 dark:border-danger-800';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return '✓';
      case 'pending':
        return '⏳';
      case 'rejected':
        return '✗';
      default:
        return '?';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-elevation-4 dark:shadow-elevation-4-dark max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-3">
            {type === 'checkout' ? (
              <MapPin className="w-6 h-6 text-primary-600 dark:text-primary-300" />
            ) : (
              <Calendar className="w-6 h-6 text-warning-600 dark:text-warning-400" />
            )}
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h2>
            <span className="px-3 py-1 bg-white dark:bg-slate-700 rounded-pill text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
              {requests?.length || 0} {requests?.length === 1 ? 'Request' : 'Requests'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-pill transition-colors duration-150 motion-reduce:transition-none group" aria-label="Close"
          >
            <X className="w-6 h-6 text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200" />
          </button>
        </div>

        {/* Content */}
        <div data-lenis-prevent className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {!requests || requests.length === 0 ? (
            <EmptyState
              icon={type === 'checkout' ? MapPin : Calendar}
              title={`No ${type === 'checkout' ? 'Checkout' : 'Leave'} Requests`}
              message={`There are no ${type === 'checkout' ? 'checkout' : 'leave'} requests for today.`}
            />
          ) : (
            <div className="space-y-4">
              {requests.map((request, index) => (
                <div
                  key={request._id || index}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-elevation-2 dark:hover:shadow-elevation-2-dark transition-shadow duration-150 motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-primary-600 rounded-pill flex items-center justify-center text-white font-bold text-lg">
                        {request.student?.fullName?.charAt(0) || 'U'}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {request.student?.fullName || 'Unknown Student'}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          UID: {request.student?.uid || 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-pill text-sm font-medium border ${getStatusColor(request.status)}`}>
                      <span className="flex items-center space-x-1">
                        <span>{getStatusIcon(request.status)}</span>
                        <span className="capitalize">{request.status || 'Unknown'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Leave Details */}
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <FileText className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Reason</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {request.leaveDetails || 'No reason provided'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <Calendar className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Date Range</p>
                          <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            <p>From: {formatDate(request.leaveDates?.start)}</p>
                            <p>To: {formatDate(request.leaveDates?.end)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Additional Info */}
                    <div className="space-y-3">
                      <div className="flex items-start space-x-3">
                        <Clock className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Duration</p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            {(() => {
                              if (!request.leaveDates?.start || !request.leaveDates?.end) return 'N/A';
                              const start = new Date(request.leaveDates.start);
                              const end = new Date(request.leaveDates.end);
                              const diffTime = Math.abs(end - start);
                              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                              return `${diffDays} ${diffDays === 1 ? 'day' : 'days'}`;
                            })()}
                          </p>
                        </div>
                      </div>

                      {type === 'leave' && (
                        <div className="flex items-start space-x-3 rounded-lg bg-sky-50/70 p-3 dark:bg-sky-950/20">
                          <UserCheck className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Work covered by</p>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1">
                              {request.delegate?.fullName || 'Not assigned'}
                            </p>
                            {request.delegate?.uid && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">UID: {request.delegate.uid}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {type === 'checkout' && (
                        <div className="flex items-start space-x-3">
                          <MapPin className="w-5 h-5 text-slate-400 dark:text-slate-500 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Request Type</p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Early Checkout</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Request ID */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Request ID: {request._id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors duration-150 motion-reduce:transition-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default LeaveDetailsModal;
