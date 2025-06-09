import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

interface CompanyTokenPayload {
  userId: string;
  email: string;
  role: 'COMPANY';
  hasActiveSubscription?: boolean;
}

export interface AuthenticatedCompanyRequest extends NextRequest {
  user: CompanyTokenPayload;
}

export function withCompanyAuth(handler: (req: AuthenticatedCompanyRequest, context?: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    try {
      // Get token from cookies or Authorization header
      const token = req.cookies.get('companyToken')?.value;

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

      const decoded = jwt.verify(token, jwtSecret) as CompanyTokenPayload;

      // Check if user is a company
      if (decoded.role !== 'COMPANY') {
        return NextResponse.json(
          { success: false, message: 'Access denied. Company access required.' },
          { status: 403 }
        );
      }

      // Add user info to request
      const authenticatedReq = req as AuthenticatedCompanyRequest;
      authenticatedReq.user = decoded;

      return handler(authenticatedReq, context);
    } catch (error) {
      console.error('Company auth middleware error:', error);
      return NextResponse.json(
        { success: false, message: 'Invalid or expired token' },
        { status: 401 }
      );
    }
  };
}