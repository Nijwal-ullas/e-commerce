import User from '../model/userSchema.js';
import Admin from '../model/adminSchema.js';

const userAuth = async (req, res, next) => {
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user);
            if (user && !user.isBlocked) {
                next();
            } else {
                res.redirect('/login');
            }
        } catch (err) {
            console.log(err);
            res.status(500).send("Internal Server Error");
        }
    } else {
        res.redirect('/login');
    }
};


const adminAuth = async (req, res, next) => {
   if (req.session.Admin && req.session.AdminId) {
    try {
        const admin = await Admin.findById(req.session.AdminId);
        if (admin) {
            next();
        } else {
            res.redirect('/admin/login');
        }
    } catch (error) {
        console.log(error);
        res.status(500).send("Internal Server Error");
    }
} else {
    res.redirect('/admin/login');
}

}

export default { userAuth, adminAuth };