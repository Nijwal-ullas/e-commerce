import User from '../model/userSchema.js';
import nodemailer from 'nodemailer';


const loadHomePage=async(req,res)=>{
    try {
        await res.render('user/home');
    } catch (error) {
        console.log(error.message);
        res.status(500).send("Internal Server Error");
    }
}

const loadLoginPage=async(req,res)=>{
    try {
        await res.render('user/loginPage')
    } catch (error) {
        console.log(error.message);
        res.status(500).send("Internal Server Error");
    }
}


const login=async(req,res)=>{
    const {Email,Password} = req.body;
     try {
        const existingUser = await User.findOne({Email})
        if(!existingUser){
            res.status(400).send("User not found");
        }
        else if(existingUser.Password !== Password){
            res.status(400).send("Invalid Password");

        }
        else{
            res.redirect('/')
        }

     } catch (error) {
        
     }
}

const loadRegisterPage=async(req,res)=>{
    try {
        await res.render('user/registerPage')
    } catch (error) {
        
    }
}

const generateOtp=()=>{
    return Math.floor(100000 + Math.random() * 900000);
}

async function sendOtpEmail(email,otp){
    try {
        const transporter = nodemailer.createTransport({
            service: 'Gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user :
                pass :
            }
    });
    } catch (error) {
        
    }
}


const register=async(req,res)=>{
    try {
        const {Email,Passord,ConfirmPassword} = req.body;
    if(Passord !== ConfirmPassword){
        return res.render('user/registerPage',{message:"Password and Confirm Password do not match"});
    }
    const existingUser = await User.findOne({Email})
    if(existingUser){
        return res.render('user/registerPage',{message:"User already exists"});
    }
    const otp = generateOtp()
    const emailSent = await sendOtpEmail(Email,otp)

    } catch (error) {
        
    }
}

export default { loadHomePage,loadLoginPage,loadRegisterPage, register, login };