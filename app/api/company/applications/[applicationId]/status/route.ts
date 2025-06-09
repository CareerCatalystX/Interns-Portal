import { NextRequest, NextResponse } from 'next/server';
import { withCompanyAuth, AuthenticatedCompanyRequest } from '@/middleware/companyAuth';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { applicationId: string };
}

// POST - Update application status
async function updateApplicationStatus(req: AuthenticatedCompanyRequest, { params }: RouteParams) {
  try {
    const { applicationId } = params;
    const body = await req.json();
    const { status, feedback } = body;

    // Validate status
    const validStatuses = ['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, message: 'Invalid status. Must be one of: ' + validStatuses.join(', ') },
        { status: 400 }
      );
    }

    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true }
    });

    if (!user?.company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    // Find application and verify it belongs to company's internship
    const application = await prisma.application.findFirst({
      where: { 
        id: applicationId,
        internship: {
          company: {
            id: user.company.id
          }
        }
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        internship: {
          select: { 
            id: true, 
            title: true, 
            companyId: true,
            campaign: {
              select: { id: true, title: true }
            }
          }
        }
      }
    });

    if (!application) {
      return NextResponse.json(
        { success: false, message: 'Application not found or access denied' },
        { status: 404 }
      );
    }

    // Check if application is already in final state
    if (application.status === 'ACCEPTED' && status !== 'ACCEPTED') {
      return NextResponse.json(
        { success: false, message: 'Cannot change status of accepted application' },
        { status: 400 }
      );
    }

    // Update application status
    const updatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: { 
        status: status as any,
        updatedAt: new Date()
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        internship: {
          select: { 
            id: true, 
            title: true,
            campaign: {
              select: { id: true, title: true }
            }
          }
        }
      }
    });

    // Log status change (optional - you can create a separate table for this)
    // await prisma.applicationStatusLog.create({
    //   data: {
    //     applicationId: applicationId,
    //     oldStatus: application.status,
    //     newStatus: status,
    //     changedBy: req.user.userId,
    //     feedback: feedback || null
    //   }
    // });

    // Format response
    const responseData = {
      id: updatedApplication.id,
      status: updatedApplication.status,
      updatedAt: updatedApplication.updatedAt,
      student: updatedApplication.user,
      internship: {
        id: updatedApplication.internship.id,
        title: updatedApplication.internship.title,
        campaign: updatedApplication.internship.campaign
      }
    };

    return NextResponse.json({
      success: true,
      message: `Application status updated to ${status.toLowerCase()}`,
      application: responseData
    });

  } catch (error) {
    console.error('Update application status error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update application status' },
      { status: 500 }
    );
  }
}

// GET - Get application details (optional - for viewing before status change)
async function getApplicationDetails(req: AuthenticatedCompanyRequest, { params }: RouteParams) {
  try {
    const { applicationId } = params;

    // Get user's company
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { company: true }
    });

    if (!user?.company) {
      return NextResponse.json(
        { success: false, message: 'Company not found' },
        { status: 404 }
      );
    }

    // Find application with full details
    const application = await prisma.application.findFirst({
      where: { 
        id: applicationId,
        internship: {
          company: {
            id: user.company.id
          }
        }
      },
      include: {
        user: {
          select: { 
            id: true, 
            name: true, 
            email: true, 
            createdAt: true 
          }
        },
        internship: {
          select: { 
            id: true, 
            title: true, 
            description: true,
            location: true,
            type: true,
            stipend: true,
            duration: true,
            skills: true,
            tags: true,
            campaign: {
              select: { id: true, title: true }
            }
          }
        }
      }
    });

    if (!application) {
      return NextResponse.json(
        { success: false, message: 'Application not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      application: {
        id: application.id,
        status: application.status,
        coverLetter: application.coverLetter,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        student: application.user,
        internship: application.internship
      }
    });

  } catch (error) {
    console.error('Get application details error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch application details' },
      { status: 500 }
    );
  }
}

export const POST = (req: NextRequest, context: RouteParams) => withCompanyAuth(updateApplicationStatus)(req, context);
export const GET = (req: NextRequest, context: RouteParams) => withCompanyAuth(getApplicationDetails)(req, context);