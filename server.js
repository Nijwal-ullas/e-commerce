const express = require('express');
const env = require('dotenv');
const path = require('path');
const app = express();

app.set('view engine','ejs');
app.set('views',path.join(__dirname,'views'));
env.config();
const port = process.env.PORT;;


app.get('/',(req,res)=>{
    res.render('home');
})



app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
})