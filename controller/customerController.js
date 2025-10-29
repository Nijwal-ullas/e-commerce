import User from '../model/userSchema.js';

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || '';
        let page = parseInt(req.query.page) || 1;
        const limit = 3;

        const userData = await User.find({
            $or: [
                { Name: { $regex: '.*' + search + '.*', $options: 'i' } },
                { Email: { $regex: '.*' + search + '.*', $options: 'i' } }
            ]
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

        const count = await User.countDocuments({
            $or: [
                { Name: { $regex: '.*' + search + '.*', $options: 'i' } },
                { Email: { $regex: '.*' + search + '.*', $options: 'i' } }
            ]
        });

        res.render('admin/customers', {
            users: userData,
            totalUsers: count,
            currentPage: page,
            totalPages: Math.ceil(count / limit)
        });
    } catch (error) {
        console.error('Error loading customers:', error);
        res.status(500).send('Server Error');
    }
};

export default { customerInfo };
