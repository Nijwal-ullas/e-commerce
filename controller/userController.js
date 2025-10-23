const loadHomePage=async(req,res)=>{
    try {
        await res.render('user/home');
    } catch (error) {
        console.log(error.message);
        res.status(500).send("Internal Server Error");
    }
}


export default { loadHomePage };