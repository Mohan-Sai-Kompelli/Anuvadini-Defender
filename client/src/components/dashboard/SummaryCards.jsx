import React from 'react';
import { UserCheck, UserX, UserMinus, Calendar } from 'lucide-react';
import StatCard from '../ui/StatCard';

/**
 * Today's summary tiles. Values are real counts fetched by the Dashboard;
 * no deltas are rendered because no prior-period comparison data is fetched.
 * Per SAACMS scope there is no Work From Home — the fourth tile instead
 * separates unapproved absences from approved leave.
 */
const SummaryCards = ({
  todayPresentCount,
  todayAbsentCount,
  todayLeaveCount,
  todayUnapprovedCount,
  stats, // kept for API compatibility
  onShowDetails,
  compact = false,
}) => {
  const cards = [
    {
      key: 'present',
      label: "Today's Present",
      value: todayPresentCount || 0,
      icon: UserCheck,
      accent: 'success',
    },
    {
      key: 'absent',
      label: "Today's Absent",
      value: todayAbsentCount || 0,
      icon: UserX,
      accent: 'danger',
    },
    {
      key: 'unapproved',
      label: 'Not Registered On App',
      value: todayUnapprovedCount || 0,
      icon: UserMinus,
      accent: 'warning',
    },
    {
      key: 'leave',
      label: 'On Approved Leave',
      value: todayLeaveCount || 0,
      icon: Calendar,
      accent: 'info',
    },
  ];

  return (
    <div className={`grid grid-cols-1 ${compact ? 'gap-4' : 'gap-6'} sm:grid-cols-2 lg:grid-cols-4`}>
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => onShowDetails(card.key)}
          className="block w-full text-left rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          title={`View ${card.label.toLowerCase()} details`}
        >
          <StatCard label={card.label} value={card.value} icon={card.icon} accent={card.accent} className="h-full" />
        </button>
      ))}
    </div>
  );
};

export default SummaryCards;
