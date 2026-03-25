import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function fmtDayLabel(day) {
  if (!day) return "";
  const [y, m, d] = day.split("-");
  return `${m}/${d}`;
}

export default function TrendLineCard({
  title,
  data,
  lines,
  yDomain = ["auto", "auto"],
  yFormatter = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(4) : "—"),
}) {
  return (
    <div className="rounded-xl border border-[#2a2a30] bg-[#121214] p-3 h-[260px]">
      <h3 className="text-sm font-medium text-slate-300 mb-2">{title}</h3>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <CartesianGrid stroke="#1e1e24" strokeDasharray="3 3" />
          <XAxis dataKey="day" tickFormatter={fmtDayLabel} minTickGap={24} tick={{ fill: "#64748b", fontSize: 10 }} />
          <YAxis domain={yDomain} tickFormatter={yFormatter} tick={{ fill: "#64748b", fontSize: 10 }} />
          <Tooltip
            formatter={(value, name) => [yFormatter(value), String(name)]}
            labelFormatter={(label) => String(label)}
            contentStyle={{ backgroundColor: "#0d0d0f", border: "1px solid #2a2a30", borderRadius: 10 }}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name || line.key}
              stroke={line.color}
              strokeWidth={1.8}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
