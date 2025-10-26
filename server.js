import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import session from 'express-session';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import userRouter from './router/user.js';
//import adminRouter from './router/admin.js';


const app = express();
dotenv.config();
connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret : process.env.SESSION_SECRET,
    resave : false,
    saveUninitialized : true,
    cookie : { maxAge : 600000 }
}))
app.use('/',userRouter);
// app.use('/admin',adminRouter);

const port = process.env.PORT;


app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
})
