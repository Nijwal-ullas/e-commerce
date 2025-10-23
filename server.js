import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));

const port = process.env.PORT;

app.get('/user/home',(req,res)=>{
    console.log("hallo")
    res.render('user/home');
})
app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
})
