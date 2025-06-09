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

    // Find student user
    const user = await prisma.user.findFirst({
      where: {
        email: email,
        role: 'STUDENT'
      }
    });

    if (!user) {
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

    // Check for active subscription
    const activeSubscription = await prisma.studentSubscription.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE',
        endsAt: {
          gt: new Date()
        }
      },
      include: {
        plan: {
          select: {
            name: true,
            features: true
          }
        }
      }
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
        userId: user.id,
        email: user.email,
        role: user.role,
        hasActiveSubscription: !!activeSubscription
      },
      jwtSecret,
      { expiresIn: '7d' }
    );

    const responseData = {
      success: true,
      message: 'Student login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasActiveSubscription: !!activeSubscription,
        ...(activeSubscription && {
          subscription: {
            plan: activeSubscription.plan.name,
            features: activeSubscription.plan.features,
            endsAt: activeSubscription.endsAt
          }
        })
      },
      token
    };

    const response = NextResponse.json(responseData);
    response.cookies.set('studentToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });

    return response;

  } catch (error) {
    console.error('Student login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}