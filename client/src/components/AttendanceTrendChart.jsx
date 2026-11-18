import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line,
} from 'recharts';

const AttendanceTrendChart = React.memo(({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={{ stroke: '#d1d5db' }}
          axisLine={{ stroke: '#d1d5db' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#6b7280' }}
          tickLine={{ stroke: '#d1d5db' }}
          axisLine={{ stroke: '#d1d5db' }}
          domain={[0, 'dataMax + 10']}
          label={{
            value: 'Number of Students',
            angle: -90,
            position: 'insideLeft',
            style: { textAnchor: 'middle', fill: '#6b7280', fontSize: '12px' },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            fontSize: '14px',
          }}
          formatter={(value, name) => [`${value} students`, name]}
          labelFormatter={(label) => `Date: ${label}`}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="line" />
        <Line
          type="monotone"
          dataKey="present"
          stroke="#4A74F0"
          strokeWidth={3}
          dot={{ fill: '#4A74F0', strokeWidth: 2, r: 5, stroke: '#ffffff' }}
          activeDot={{ r: 7, stroke: '#4A74F0', strokeWidth: 2, fill: '#4A74F0' }}
          name="Total Present"
        />
        <Line
          type="monotone"
          dataKey="absent"
          stroke="#ef4444"
          strokeWidth={3}
          dot={{ fill: '#ef4444', strokeWidth: 2, r: 5, stroke: '#ffffff' }}
          activeDot={{ r: 7, stroke: '#ef4444', strokeWidth: 2, fill: '#ef4444' }}
          name="Total Absent"
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default AttendanceTrendChart;


