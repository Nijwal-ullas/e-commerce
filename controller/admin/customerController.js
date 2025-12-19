import user from "../../model/userSchema.js";


const customerInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || "";

    let query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query = {
        $or: [{ name: regex }, { email: regex }],
      };
    }

    const totalUsers = await user.countDocuments(query);

    const users = await user
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.render("admin/customers", {
      users,
      totalUsers,
      currentPage: page,
      totalPages: Math.ceil(totalUsers / limit),
      search,
      limit,
    });
  } catch (error) {
    console.error("Error loading customers:", error);
    res.status(500).send("Server Error");
  }
};




const blockCustomer = async (req, res) => {
  try {
    const userId = req.query.id;
    const { page = 1, search = "" } = req.query; 

    await user.updateOne({ _id: userId }, { $set: { isBlocked: true } });

    res.redirect(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).send("Server Error");
  }
};


const unblockCustomer = async (req, res) => {
  try {
    const userId = req.query.id;
    const { page = 1, search = "" } = req.query;

    await user.updateOne({ _id: userId }, { $set: { isBlocked: false } });

    res.redirect(`/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).send("Server Error");
  }
};






export default { customerInfo, blockCustomer, unblockCustomer };
