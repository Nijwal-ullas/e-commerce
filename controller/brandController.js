import Brand from "../model/brandSchema.js";
import product from "../model/productSchema.js";


const brandPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;

        const totalBrands = await Brand.countDocuments();
        const brands = await Brand.find().skip(skip).limit(limit);
        const totalpages = Math.ceil(totalBrands / limit);
        const reverseBrands = brands.reverse();
        res.render("admin/brandPage", {
            brands : reverseBrands,
            currentPage: page,
            totalPages: totalpages,
            totalBrands :totalBrands,
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send("Server Error");
    }
};



export default { brandPage };
