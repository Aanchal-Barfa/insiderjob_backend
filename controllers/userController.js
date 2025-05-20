import Job from "../models/Job.js"
import JobApplication from "../models/JobApplication.js"
import  User from "../models/User.js"
import {v2 as cloudinary} from "cloudinary"
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = express.Router();
const JWT_SECRET = 'h2h34lh2hggg23';




// Signup Controller
export const usersignup = async (req, res) => {
    const { name, email, password, image, resume } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser)
            return res.status(400).json({ message: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            // image,
            // resume,
        });

        const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: "1h" });

        res.status(201).json({ user: newUser, token });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Login Controller
export const userlogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user)
            return res.status(400).json({ message: "Invalid email or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ message: "Invalid email or password" });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1h" });

        res.status(200).json({ user, token });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get  user data
export const getUserData = async(req,res) => {

    const userId = req.auth.userId 

    try {
        
        let user = await User.findById(userId);

        if (!user) {
          try {
                // We'll need to get user data from Clerk
                // Since we don't have access to Clerk's API here directly,
                // we'll return a specific error code that the frontend can handle
                return res.json({
                    success: false,
                    message: 'User Not Found',
                    code: 'USER_NOT_FOUND_NEEDS_CREATION'
                });
            } catch (createError) {
                console.error('Error in automatic user creation:', createError);
                return res.json({success: false, message: 'Failed to create user automatically'});
            }
        }

        res.json({success:true, user})

    } catch (error) {
            res.json({success:false, message:error.message})
    }

}

export const createUserIfNotExists = async (req, res) => {
    const { userId } = req.auth;
    const { firstName, lastName, email, image } = req.body;

    try {
        console.log('Creating user with data:', { userId, firstName, lastName, email });

        // First try to find the user by ID
        let user = await User.findById(userId);
        console.log('User found by ID:', user ? 'Yes' : 'No');

        // If user not found by ID, try to find by email
        if (!user && email) {
            user = await User.findOne({ email });
            console.log('User found by email:', user ? 'Yes' : 'No');
        }

        // If user still not found, create a new user
        if (!user) {
            // Make sure we have all required fields
            if (!firstName || !lastName || !email || !image) {
                console.log('Missing required user information');
                return res.json({
                    success: false,
                    message: 'Missing required user information'
                });
            }

            try {
                // Check if there are any users with null clerkUserId that might cause conflicts
                const conflictingUsers = await User.find({
                    $or: [
                        { email: email },
                        { _id: userId }
                    ]
                });

                if (conflictingUsers.length > 0) {
                    console.log('Found conflicting users:', conflictingUsers.length);
                    // Delete any conflicting users to avoid duplicate key errors
                    for (const conflictUser of conflictingUsers) {
                        console.log('Removing conflicting user:', conflictUser._id);
                        await User.findByIdAndDelete(conflictUser._id);
                    }
                }

                // Now create the new user
                user = await User.create({
                    _id: userId,
                    name: `${firstName} ${lastName}`,
                    email,
                    image,
                    resume: ''
                });
                console.log('User created successfully:', userId);
            } catch (createError) {
                console.error('Error creating user:', createError);
                return res.json({
                    success: false,
                    message: `Failed to create user: ${createError.message}`
                });
            }
        } else {
            // If user exists but some fields might need updating
            if (user._id !== userId) {
                console.log('Updating user ID from', user._id, 'to', userId);
                // This means we found the user by email but with a different ID
                // We need to delete the old user and create a new one with the correct ID
                try {
                    await User.findByIdAndDelete(user._id);
                    user = await User.create({
                        _id: userId,
                        name: user.name || `${firstName} ${lastName}`,
                        email: user.email || email,
                        image: user.image || image,
                        resume: user.resume || ''
                    });
                } catch (updateError) {
                    console.error('Error updating user ID:', updateError);
                    return res.json({
                        success: false,
                        message: `Failed to update user ID: ${updateError.message}`
                    });
                }
            } else {
                // Update other fields if needed
                const needsUpdate =
                    (firstName && lastName && user.name !== `${firstName} ${lastName}`) ||
                    (email && user.email !== email) ||
                    (image && user.image !== image);

                if (needsUpdate) {
                    console.log('Updating user fields');
                    user.name = `${firstName} ${lastName}`;
                    user.email = email;
                    user.image = image;
                    await user.save();
                }
            }
        }

        res.json({ success: true, user });
    } catch (error) {
        console.error('Error in createUserIfNotExists:', error);
        res.json({ success: false, message: error.message });
    }
};



// Apply for a  job 
export const applyForJob = async (req,res) => {

    const { jobId } = req.body 

    const userId = req.auth.userId

    try {
        
        const isAlreadyApplied = await JobApplication.find({jobId, userId})

        if (isAlreadyApplied.length > 0) {
            return res.json({success:false,message:'Already Applied'}) 
        }

        const jobData = await Job.findById(jobId)

        if (!jobData) {
            return res.json({success:false, message:'job Not Found'})
        }

        await JobApplication.create({
            companyId: jobData.companyId,
            userId,
            jobId,
            date: Date.now()
        })

        res.json({success:true, message:'Applied Successfully'})

    } catch (error) {
        res.json({success:false, message: error.message})
    }

}

// Get user applied applications
export const getUserJobApplications = async (req,res) => {
    
    try {
        
        const userId = req.auth.userId

        const applications = await JobApplication.find({userId})
        .populate('companyId','name email image')
        .populate('jobId', 'title description location category level salary')
        .exec()

        if (!applications) {
            return res.json({success: false, message:'No job application found for this user '})
        }

        return res.json({success:true, applications})

    } catch (error) {
        res.json({success:false, message:error.message})
    }

}

// update user resume
export const updateUserResume = async (req,res) => {
    try {

        const userId = req.auth.userId

        const resumeFile = req.file

        const userData = await User.findById(userId)

        if (resumeFile) {
            const resumeUpload = await cloudinary.uploader.upload(resumeFile.path)
            userData.resume = resumeUpload.secure_url
        }

        await userData.save()

        return res.json({success:true, message:'Resume Updated'})

    } catch (error) {
        
        res.json({success:false, message: error.message})

    }
}