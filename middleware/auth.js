import user from "../model/userSchema.js";
import admin from "../model/adminSchema.js";

const checkUser = async (req, res, next) => {
  if (req.originalUrl.startsWith('/admin')) return next();

  if (!req.session.user) {
    if (req.xhr || req.headers.accept.includes("application/json")) {
      return res.status(401).json({
        success: false,
        message: "Please login to continue",
        redirect: "/login",
      });
    }
    return res.redirect("/login");
  }

  try {
    const currentUser = await user.findById(req.session.user._id || req.session.user);
    if (currentUser && !currentUser.isBlocked) {
      res.locals.user = currentUser;
      return next();
    } else {
      delete req.session.user;
      res.locals.user = null;
      return res.redirect("/login");
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
};


const requireLoginJson = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please login to continue",
      redirect: "/login",
    });
  }
  next();
};


const adminAuth = async (req, res, next) => {

  if (req.session.adminId) {
    try {
      const currentAdmin = await admin.findById(req.session.adminId);
      
      if (currentAdmin) {
        res.locals.admin = currentAdmin;
        return next();
      } else {
        delete req.session.adminId;
      }
    } catch (error) {
      console.error("Admin auth error:", error);
    }
  } 
  
  return res.redirect("/admin/login");
};

const isBlocked = async (req, res, next) => {
    if (req.originalUrl.startsWith('/admin')) {
    return next();
  }
  if (req.session.user?._id || req.session.user) {
    try {
      const userId = req.session.user._id || req.session.user;
      const userData = await user.findById(userId).select("isBlocked");
      if (userData?.isBlocked) {
        delete req.session.user;
        res.locals.user = null;
        return res.redirect("/login");
      }
    } catch (err) {
      console.error("Block check error:", err);
    }
  }
  next();
};

const setUser = (req, res, next) => {
  if (req.originalUrl.startsWith('/admin')) {
    res.locals.user = null;
    res.locals.admin = req.session.adminId ? true : false;
  } else {
    res.locals.user = req.session.user || null;
    res.locals.admin = false;
  }
  
  next();
};

const setCurrentRoute = (req, res, next) => {
  if (!res) {
    return next(); 
  }
  res.locals.currentRoute = req.path;
  next();
};

export default { checkUser, adminAuth, isBlocked, setUser, setCurrentRoute,requireLoginJson };