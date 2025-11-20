import express from "express";
import dotenv from "dotenv";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import userRouter from "./router/user/user.js";
import userProductRouter from "./router/user/productRouter.js"

import adminRouter from "./router/admin/admin.js";
import brandRouter from "./router/admin/brandRoutes.js"
import categoryRouter from "./router/admin/categoryRoutes.js"
import customerRouter from "./router/admin/customerRoutes.js"
import productRouter from "./router/admin/productRoutes.js"

import auth from "./middleware/auth.js";
import passport from "./config/passport.js";
import morgan from "morgan";

dotenv.config();
await connectDB();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("view engine", "ejs");
app.use(morgan("dev"));
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(session({
  name: "user-session",
  secret: process.env.SESSION_SECRET + "-user",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "user-sessions",
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    secure: false,
    httpOnly: true
  }
}));

app.use("/admin", session({
  name: "admin-session",
  secret: process.env.SESSION_SECRET + "-admin",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    collectionName: "admin-sessions",
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    secure: false,
    httpOnly: true,
    path: "/admin"
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(auth.setUser);


app.use("/", userRouter);
app.use("/",userProductRouter);

app.use("/admin", adminRouter); 
app.use("/admin",brandRouter);
app.use("/admin",categoryRouter);
app.use("/admin",customerRouter);
app.use("/admin",productRouter);

app.use((req, res) => {
  res.status(404).render("error");
});

app.use((err, req, res, next) => {
  res.status(500).render("error.ejs");
});


const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});