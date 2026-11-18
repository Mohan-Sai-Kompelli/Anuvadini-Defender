import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const DEFAULT_COLORS = ['#8884d8', '#93AEFB', '#ffc658', '#ff8042'];

const GenderPieChart = React.memo(({ data, total, colors = DEFAULT_COLORS, outerRadius = 80 }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(1)}%)`}
          outerRadius={outerRadius}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [
            `${value} (${total ? ((value / total) * 100).toFixed(1) : 0}%)`,
            name,
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
});

export default GenderPieChart;


