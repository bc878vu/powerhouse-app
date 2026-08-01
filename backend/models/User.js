const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // --- BASIC & AUTH ---
    name: { type: String, required: true },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: "" }, // Cloudinary URL save hoga yahan
    
    // --- EMPLOYMENT INFO (NEW) ---
    employeeID: { type: String, unique: true }, // Jaise PH-1001
    role: {
      type: String,
      enum: ["superadmin", "admin", "electrician", "cro"], // Roles updated
      default: "electrician",
    },
    joiningDate: { type: Date, default: Date.now },
    maritalStatus: { 
      type: String, 
      enum: ["Single", "Married", "Divorced"], 
      default: "Single" 
    },
    address: String,
    backgroundInfo: String, // Education/Experience details

    // --- TOOLS & EQUIPMENT (NEW) ---
    // Isme hum track karenge ke staff ko kya saman diya gaya hai
    assignedTools: [
      {
        toolName: String,
        issuedDate: { type: Date, default: Date.now },
        condition: String, // e.g., New, Used
      }
    ],

    // --- LEAVE MANAGEMENT (NEW) ---
    leaves: {
      totalAllowed: { type: Number, default: 20 }, // Salana chuttiyan
      taken: { type: Number, default: 0 },
      pending: { type: Number, default: 20 },
    },

    // --- SYSTEM & SECURITY ---
    isVerified: { type: Boolean, default: false },
    otp: String,
    otpExpiry: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);