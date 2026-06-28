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
  const [y, m, d] = String(day).split("-");
  return m && d ? `${m}/${d}` : String(day);
}

export default function SparklineCard({
  title,
  data,
  dataKey = "value",
  color = "#10b981",
  yDomain = ["auto", "auto"],
  yFormatter = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString() : "—"),
  heightClass = "h-[200px]",
}) {
  if (!data?.length) {
    return (
      <div className={`rounded-xl border border-[#2a2a30] bg-[#121214] p-3 ${heightClass} flex items-center justify-center`}>
        <p className="text-xs text-slate-500">No chart data</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[#2a2a30] bg-[#121214] p-3 ${heightClass}`}>
      {title && <h3 className="text-sm font-medium text-slate-300 mb-2">{title}</h3>}
      <ResponsiveContainer width="100%" height={title ? "85%" : "100%"}>
        <LineChart data={data}>
          <CartesianGrid stroke="#1e1e24" strokeDasharray="3 3" />
          <XAxis dataKey="day" tickFormatter={fmtDayLabel} minTickGap={28} tick={{ fill: "#64748b", fontSize: 10 }} />
          <YAxis domain={yDomain} tickFormatter={yFormatter} tick={{ fill: "#64748b", fontSize: 10 }} width={48} />
          <Tooltip
            formatter={(value) => [yFormatter(value), title || dataKey]}
            labelFormatter={(label) => String(label)}
            contentStyle={{ backgroundColor: "#0d0d0f", border: "1px solid #2a2a30", borderRadius: 10 }}
          />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.8} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
