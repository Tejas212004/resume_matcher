import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const result = location.state?.result;

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h2 className="text-gray-600 text-lg">No results found.</h2>
        <button
          onClick={() => navigate("/")}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Go Back
        </button>
      </div>
    );
  }

  const data = [
    { name: "Matched Skills", value: result.matched_skills.length },
    { name: "Unmatched Skills", value: result.jd_skills.length - result.matched_skills.length },
  ];

  const COLORS = ["#4F46E5", "#CBD5E1"]; // Purple + light gray

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex flex-col items-center p-6">
      <div className="bg-white shadow-2xl rounded-2xl p-8 w-full max-w-3xl border border-gray-100">
        <h2 className="text-3xl font-semibold text-center mb-6 text-blue-700">
          Skill Match Results
        </h2>

        <div className="flex flex-col md:flex-row items-center justify-center gap-8">
          <div className="w-full md:w-1/2 flex justify-center">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data}
                  innerRadius={70}
                  outerRadius={100}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="text-center md:text-left md:w-1/2">
            <p className="text-lg font-medium mb-4">
              Match Score:{" "}
              <span className="text-blue-700 font-bold text-2xl">
                {result.match_score}%
              </span>
            </p>

            <div className="mb-4">
              <h3 className="font-semibold text-gray-700 mb-2">Matched Skills</h3>
              <div className="flex flex-wrap gap-2">
                {result.matched_skills.length > 0 ? (
                  result.matched_skills.map((skill, i) => (
                    <span
                      key={i}
                      className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-sm"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm">No matching skills found.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Resume Skills</h3>
            <div className="flex flex-wrap gap-2">
              {result.resume_skills.map((skill, i) => (
                <span
                  key={i}
                  className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-2">JD Skills</h3>
            <div className="flex flex-wrap gap-2">
              {result.jd_skills.map((skill, i) => (
                <span
                  key={i}
                  className="bg-green-100 text-green-700 px-2 py-1 rounded-md text-sm"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            onClick={() => navigate("/")}
            className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
