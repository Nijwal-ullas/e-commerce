import bcrypt from "bcrypt";
import Admin from "../model/adminSchema.js";

const loadAdminLoginPage = async (req, res) => {
  try {
    if (req.session.Admin) {
      return res.redirect("/admin/dashboard");
    }
    res.render("admin/loginPage", { message: null });
  } catch (error) {
    console.log(error.message);
    res.status(500).send("Internal Server Error");
  }
};


const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.render("admin/loginPage", { message: "Please fill all fields" });
    }
    const existingUser = await Admin.findOne({ email });
    if (!existingUser) {
      return res.render("admin/loginPage", { message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res.render("admin/loginPage", { message: "Invalid email" });
    }
    req.session.Admin = true;
    req.session.AdminId = existingUser._id;
    return res.redirect("/admin/dashboard");
  } catch (error) {
    console.log("Login Error:", error.message);
    res.status(500).send("Internal Server Error");
  }
};


const loadDashboardPage = async (req, res) => {
  if (req.session.Admin) {
    try {
      const admin = await Admin.findById(req.session.AdminId);
      const adminName = admin ? admin.email : "Admin";  
      return res.render("admin/dashboard", { adminName });
    } catch (error) {
      console.log(error.message);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin/login");
  }
};

const logout = async (req, res) => {
   try {
    req.session.destroy((err) => {
      if (err) {
        console.log("Error destroying session:", err);
        return res.status(500).send("Internal Server Error");
      }
      res.redirect("/admin/login");
    });
   } catch (error) {
     console.log(error.message);
      res.status(500).send("Internal Server Error");
   }
}


export default { loadAdminLoginPage, login, loadDashboardPage, logout };
