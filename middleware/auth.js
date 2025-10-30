import user from "../model/userSchema.js";
import admin from "../model/adminSchema.js";

const userAuth = async (req, res, next) => {
  if (req.session.user) {
    try {
      const currentUser = await user.findById(req.session.user);
      if (currentUser && !currentUser.isBlocked) {
        next();
      } else {
        res.redirect("/login");
      }
    } catch (err) {
      console.log(err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/login");
  }
};

const adminAuth = async (req, res, next) => {
  if (req.session.admin && req.session.adminId) {
    try {
      const currentAdmin = await admin.findById(req.session.adminId);
      if (currentAdmin) {
        next();
      } else {
        res.redirect("/admin/login");
      }
    } catch (error) {
      console.log(error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/admin/login");
  }
};

export default { userAuth, adminAuth };
