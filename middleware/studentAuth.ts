import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

interface StudentTokenPayload {
  userId: string;
  email: string;
  role: 'STUDENT';
  hasActiveSubscription: boolean;
}

export interface AuthenticatedStudentRequest extends NextRequest {
  user: StudentTokenPayload;
}

export function withStudentAuth(handler: (req: AuthenticatedStudentRequest, context?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // Get token from cookies or Authorization header
      const token = req.cookies.get('studentToken')?.value;

      if (!token) {
        return NextResponse.json(
          { success: false, message: 'Authentication required' },
          { status: 401 }
        );
      }

      // Verify JWT token
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return NextResponse.json(
          { success: false, message: 'Server configuration error' },
          { status: 500 }
        );
      }

      const decoded = jwt.verify(token, jwtSecret) as StudentTokenPayload;

      // Check if user is a student
      if (decoded.role !== 'STUDENT') {
        return NextResponse.json(
          { success: false, message: 'Access denied. Student access required.' },
          { status: 403 }
        );
      }

      // Add user info to request
      const authenticatedReq = req as AuthenticatedStudentRequest;
      authenticatedReq.user = decoded;

      return handler(authenticatedReq, context);
    } catch (error) {
      console.error('Student auth middleware error:', error);
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
  };
}

// Middleware that also checks for active subscription
export function withPaidStudentAuth(handler: (req: AuthenticatedStudentRequest, context?: any) => Promise<NextResponse>) {
  return withStudentAuth(async (req: AuthenticatedStudentRequest, context?: any) => {
    if (!req.user.hasActiveSubscription) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Active subscription required to access internships',
          requiresSubscription: true 
        },
        { status: 403 }
      );
    }
    
    return handler(req, context);
  });
}