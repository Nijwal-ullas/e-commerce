import Wallet from "../../model/walletSchema.js";
import User from "../../model/userSchema.js";
import razorpay from "../../helpers/razorpay.js";
import crypto from "crypto";

const getWallet = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect("/login");
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        const filterType = req.query.filter || 'all';

        let wallet = await Wallet.findOne({ UserId: userId });

        if (!wallet) {
            wallet = new Wallet({
                UserId: userId,
                Balance: "0",
                Wallet_transaction: [] 
            });
            await wallet.save();
        }

        if (!wallet.Wallet_transaction) {
            wallet.Wallet_transaction = [];
            await wallet.save();
        }

        const userData = await User.findById(userId).select('name email');
        if (!userData) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }

        let filteredTransactions = wallet.Wallet_transaction || [];
        if (filterType !== 'all') {
            filteredTransactions = filteredTransactions.filter(t => t.Type === filterType);
        }

        const sortedTransactions = filteredTransactions.sort((a, b) => 
            new Date(b.CreatedAt) - new Date(a.CreatedAt)
        );

        const totalTransactions = sortedTransactions.length;
        const totalPage = Math.ceil(totalTransactions / limit);
        
        const startIndex = skip;
        const endIndex = Math.min(skip + limit, totalTransactions);
        const paginatedTransactions = sortedTransactions.slice(startIndex, endIndex);

        const formattedTransactions = paginatedTransactions.map(transaction => {
            return {
                type: transaction.Type,
                amount: parseFloat(transaction.Amount) || 0,
                description: transaction.Type === 'credit' ? 'Money added to wallet' : 'Payment from wallet',
                orderId: transaction.orderId || null,
                createdAt: transaction.CreatedAt,
                balanceAfter: parseFloat(wallet.Balance) || 0
            };
        });

        res.render('user/wallet', {
            user: {
                name: userData.name,
                email: userData.email
            },
            wallet: {
                balance: parseFloat(wallet.Balance) || 0
            },
            transactions: formattedTransactions,
            pageTitle: 'My Wallet - Ruhe Collection',
            page: page,
            totalPage: totalPage,
            currentFilter: filterType,
            razorpayKey: process.env.RAZORPAY_KEY_ID || ''
        });

    } catch (error) {
        console.log("Get wallet error:", error.message);
        res.status(500).send("Internal Server Error");
    }
};

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        const { amount } = req.body;
        
        if (!amount || amount < 1 || amount > 50000) {
            return res.status(400).json({
                success: false,
                message: "Amount must be between ₹1 and ₹50,000"
            });
        }

        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            return res.status(500).json({
                success: false,
                message: "Payment gateway not configured. Please contact support."
            });
        }

        const razorpayOptions = {
            amount: Math.round(amount * 100), 
            currency: "INR",
            receipt: `wallet_${Date.now()}_${userId.toString().slice(-6)}`,
            notes: {
                user_id: userId.toString(),
                type: "wallet_topup",
                amount: amount.toString()
            }
        };

        let razorpayOrder;
        try {
            razorpayOrder = await razorpay.orders.create(razorpayOptions);
        } catch (razorpayError) {
            console.error("Razorpay order creation error:", razorpayError);
            return res.status(500).json({
                success: false,
                message: `Payment gateway error: ${razorpayError.message || 'Failed to create payment order'}`
            });
        }

        req.session.pendingWalletTopup = {
            razorpayOrderId: razorpayOrder.id,
            amount: parseFloat(amount),
            userId: userId,
            timestamp: Date.now()
        };

        res.json({
            success: true,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("Create Razorpay order error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create payment order. Please try again."
        });
    }
};

const verifyWalletPayment = async (req, res) => {
    try {
        const { 
            razorpay_payment_id, 
            razorpay_order_id, 
            razorpay_signature 
        } = req.body;

        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Payment verification failed: Invalid signature"
            });
        }

        const pendingTopup = req.session.pendingWalletTopup;
        if (
    !pendingTopup ||
    pendingTopup.razorpayOrderId !== razorpay_order_id ||
    pendingTopup.userId.toString() !== userId.toString()
) {
    return res.status(400).json({
        success: false,
        message: "Invalid or expired payment session"
    });
}


        let wallet = await Wallet.findOne({ UserId: userId });
        if (!wallet) {
            wallet = new Wallet({
                UserId: userId,
                Balance: "0",
                Wallet_transaction: []
            });
        }

        if (!wallet.Wallet_transaction || !Array.isArray(wallet.Wallet_transaction)) {
            wallet.Wallet_transaction = [];
        }

        const currentBalance = parseFloat(wallet.Balance) || 0;
        const amount = pendingTopup.amount;
        const newBalance = currentBalance + amount;

        const transaction = {
            Amount: amount.toString(),
            Type: 'credit',
            CreatedAt: new Date()
        };

        wallet.Balance = newBalance.toString();
        wallet.Wallet_transaction.push(transaction);
        
        await wallet.save();

        delete req.session.pendingWalletTopup;

        res.json({
            success: true,
            message: `₹${amount} added to your wallet successfully`,
            balance: newBalance,
            transaction: {
                type: 'credit',
                amount: amount,
                description: 'Money added via Razorpay',
                createdAt: transaction.CreatedAt,
                balanceAfter: newBalance
            }
        });

    } catch (error) {
        console.error("Verify wallet payment error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to verify payment. Please contact support."
        });
    }
};

const getWalletBalance = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        const wallet = await Wallet.findOne({ UserId: userId });
        
        res.json({
            success: true,
            balance: parseFloat(wallet?.Balance) || 0
        });

    } catch (error) {
        console.error("Get balance error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to get wallet balance"
        });
    }
};

const handlePaymentFailure = async (req, res) => {
    try {
        const { razorpay_order_id } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Please login first"
            });
        }

        if (req.session.pendingWalletTopup && 
            req.session.pendingWalletTopup.razorpayOrderId === razorpay_order_id) {
            delete req.session.pendingWalletTopup;
        }

        res.json({
            success: true,
            message: "Payment cancelled. No money was added to your wallet."
        });

    } catch (error) {
        console.error("Handle payment failure error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to handle payment failure"
        });
    }
};

export default {
    getWallet,
    createRazorpayOrder,
    verifyWalletPayment,
    getWalletBalance,
    handlePaymentFailure
};