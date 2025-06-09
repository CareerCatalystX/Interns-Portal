import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { 
      name, 
      email, 
      password, 
      companyName, 
      companyWebsite, 
      companyDescription,
      companyLogo 
    } = await request.json();

    // Validation
    if (!name || !email || !password || !companyName) {
      return NextResponse.json(
        { error: 'Name, email, password, and company name are required' },
        { status: 400 }
      );
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    // Password validation
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters long' },
        { status: 400 }
      );
    }

    // Website validation (optional)
    if (companyWebsite) {
      const urlRegex = /^https?:\/\/.+\..+$/;
      if (!urlRegex.test(companyWebsite)) {
        return NextResponse.json(
          { error: 'Please provide a valid website URL' },
          { status: 400 }
        );
      }
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Check if company name already exists
    const existingCompany = await prisma.company.findFirst({
      where: { 
        name: {
          equals: companyName,
          mode: 'insensitive'
        }
      }
    });

    if (existingCompany) {
      return NextResponse.json(
        { error: 'A company with this name already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create company and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create company first
      const company = await tx.company.create({
        data: {
          name: companyName,
          website: companyWebsite || null,
          description: companyDescription || null,
          logoUrl: companyLogo || null
        }
      });

      // Create user linked to company
      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'COMPANY',
          companyId: company.id
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              website: true,
              description: true,
              logoUrl: true
            }
          }
        }
      });

      return user;
    });

    // Check JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: result.id,
        email: result.email,
        role: result.role,
        companyId: result.company?.id,
        hasActiveCampaigns: false // New companies don't have campaigns
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const responseData = {
      success: true,
      message: 'Company registration successful',
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
        company: {
          id: result.company?.id,
          name: result.company?.name,
          website: result.company?.website,
          description: result.company?.description,
          logoUrl: result.company?.logoUrl,
          activeCampaigns: 0,
          totalCampaigns: 0
        }
      },
      token,
      nextStep: 'create-campaign',
      welcomeMessage: 'Welcome! Create your first hiring campaign to start posting internships.'
    };

    const response = NextResponse.json(responseData);
    response.cookies.set('companyToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });

    return response;

  } catch (error: any) {
    console.error('Company signup error:', error);
    
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}