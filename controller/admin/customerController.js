import user from "../../model/userSchema.js";


const customerInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
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

    await user.updateOne(
      { _id: userId },
      { $set: { isBlocked: true } }
    );

    const backURL = req.headers.referer || "/admin/users";
    return res.redirect(backURL);

  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).send("Server Error");
  }
};



const unblockCustomer = async (req, res) => {
  try {
    const userId = req.query.id;

    await user.updateOne(
      { _id: userId },
      { $set: { isBlocked: false } }
    );
    const backURL = req.headers.referer || "/admin/users";
    return res.redirect(backURL);

  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).send("Server Error");
  }
};







export default { customerInfo, blockCustomer, unblockCustomer };
