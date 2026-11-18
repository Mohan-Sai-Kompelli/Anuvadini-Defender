import React from 'react';
import { Users, Calendar, MapPin, Clock } from "lucide-react";

const QuickActions = ({ onNavigate }) => {
  const actions = [
    {
      icon: Users,
      title: "Add Student",
      description: "Register new student",
      color: "primary",
      onClick: () => onNavigate('/add-student')
    },
    {
      icon: Calendar,
      title: "View Reports",
      description: "Attendance reports",
      color: "success",
      onClick: () => onNavigate('/reports')
    },
    {
      icon: MapPin,
      title: "Update Location",
      description: "Organization location",
      color: "warning",
      onClick: () => onNavigate('/settings')
    },
    {
      icon: Clock,
      title: "Check-in",
      description: "Student check-in",
      color: "secondary",
      onClick: () => onNavigate('/checkin')
    }
  ];

  const getColorClasses = (color) => {
    const colorMap = {
      primary: {
        icon: 'text-primary-600',
        gradient: 'from-primary-100/60 to-success-100/60'
      },
      success: {
        icon: 'text-success-600',
        gradient: 'from-success-100/60 to-warning-100/60'
      },
      warning: {
        icon: 'text-warning-600',
        gradient: 'from-warning-100/60 to-secondary-100/60'
      },
      secondary: {
        icon: 'text-secondary-600',
        gradient: 'from-secondary-100/60 to-primary-100/60'
      }
    };
    return colorMap[color] || colorMap.primary;
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {actions.map((action, index) => {
        const Icon = action.icon;
        const colorClasses = getColorClasses(action.color);
        
        return (
          <button 
            key={index}
            className="relative overflow-hidden rounded-xl bg-white p-0 shadow group ring-1 ring-gray-100 transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
            onClick={action.onClick}
          >
            <div className="card-body text-center">
              <span className={`absolute inset-x-0 -top-10 h-20 bg-gradient-to-r ${colorClasses.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}></span>
              <Icon className={`relative mx-auto h-8 w-8 ${colorClasses.icon} mb-2`} />
              <h3 className="text-sm font-medium text-gray-900">Add Student</h3>
              <p className="text-xs text-gray-500">Register new student</p>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
