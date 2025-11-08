import user from "../model/userSchema.js";
import admin from "../model/adminSchema.js";

const userAuth = async (req, res, next) => {
  if (req.session.user) {
    try {
      const currentUser = await user.findById(req.session.user);

      if (currentUser && !currentUser.isBlocked) {
        
        res.locals.user = currentUser;

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
  if (req.session?.admin && req.session?.adminId) {
    try {
      const currentAdmin = await admin.findById(req.session.adminId);
      if (currentAdmin) {
        res.locals.admin = currentAdmin;
        return next();
      }
    } catch (error) {
      console.error("Admin auth error:", error);
    }
  }
  res.redirect("/admin/login");
};

const isBlocked = async (req, res, next) => {
  if (req.session.user?._id) {
    try {
      const userData = await user.findById(req.session.user._id).select("isBlocked");
      if (userData?.isBlocked) {
        delete req.session.user;     
        res.locals.user = null;
        return next();
      }
    } catch (err) {
      console.error("Block check error:", err);
    }
  }
  next();
};


const setUser = (req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
};

export default { userAuth, adminAuth, isBlocked, setUser };
