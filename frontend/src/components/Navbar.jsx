import React from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md">
      <h1 className="font-bold text-lg">SkillMatch</h1>
      <div className="flex space-x-6">
        <Link to="/" className="hover:text-gray-200">Home</Link>
        <Link to="/result" className="hover:text-gray-200">Results</Link>
      </div>
    </nav>
  );
}
