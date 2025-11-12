import express from "express";
import dotenv from "dotenv";
import path from "path";
import session from "express-session";
import MongoStore from "connect-mongo";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import userRouter from "./router/user/user.js";
import adminRouter from "./router/admin/admin.js";
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

app.use(
  session({
    name : "admin-session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: false,
    },
  })
);

app.use(
  session({
    name : "user-session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: "sessions",
      ttl: 14 * 24 * 60 * 60,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      secure: false,
    },
  })
);


app.use(passport.initialize());
app.use(passport.session());

app.use(auth.setUser);

app.use("/", userRouter);
app.use("/admin", adminRouter);

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
