import React from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  const linkClasses =
    "hover:text-gray-200 transition-colors duration-200 px-2 py-1";

  return (
    <nav className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md">
      {/* Logo / App name */}
      <h1 className="font-bold text-xl tracking-wide">SkillMatch</h1>

      {/* Navigation links */}
      <div className="flex space-x-6">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? "border-b-2 border-white" : ""}`
          }
        >
          Home
        </NavLink>

        <NavLink
          to="/result"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? "border-b-2 border-white" : ""}`
          }
        >
          Results
        </NavLink>

        <NavLink
          to="/mock-interview"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? "border-b-2 border-white" : ""}`
          }
        >
          Mock Interview
        </NavLink>
      </div>
    </nav>
  );
}
