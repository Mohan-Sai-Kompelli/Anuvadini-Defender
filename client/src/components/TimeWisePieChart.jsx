import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const DEFAULT_COLORS = ['#8DC63F', '#87CEEB', '#FFD700', '#FF6347', '#8A2BE2'];

const TimeWisePieChart = React.memo(({ data, minAngle = 5 }) => {
  const filteredData = useMemo(() => (data || []).filter(item => item.value > 0), [data]);
  const hasData = filteredData.length > 0;
  
  if (!hasData) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={filteredData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percentage }) => `${name} (${percentage}%)`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
          minAngle={minAngle}
        >
          {filteredData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value, name) => [`${value} students`, name]} />
      </PieChart>
    </ResponsiveContainer>
  );
});

export default TimeWisePieChart;


