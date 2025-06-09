import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find company user with company details
    const user = await prisma.user.findFirst({
      where: {
        email: email,
        role: 'COMPANY'
      },
      include: {
        company: {
          include: {
            campaigns: {
              where: {
                status: 'ACTIVE',
                endDate: {
                  gt: new Date()
                }
              },
              include: {
                payment: {
                  select: {
                    status: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!user || !user.company) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check active campaigns with paid status
    const activePaidCampaigns = user.company.campaigns.filter(
      campaign => campaign.payment?.status === 'COMPLETED'
    );

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
        userId: user.id,
        email: user.email,
        role: user.role,
        companyId: user.company.id,
        hasActiveCampaigns: activePaidCampaigns.length > 0
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const responseData = {
      success: true,
      message: 'Company login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: {
          id: user.company.id,
          name: user.company.name,
          logoUrl: user.company.logoUrl,
          activeCampaigns: activePaidCampaigns.length,
          totalCampaigns: user.company.campaigns.length
        }
      },
      token
    };

    const response = NextResponse.json(responseData);
    response.cookies.set('companyToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });

    return response;

  } catch (error) {
    console.error('Company login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}