import { NextRequest, NextResponse } from 'next/server';
import { withStudentAuth, AuthenticatedStudentRequest } from '@/middleware/studentAuth';
import prisma from '@/lib/prisma'

interface RouteParams {
  params: { applicationId: string };
}

// GET - Get specific application details
async function getApplicationDetails(req: AuthenticatedStudentRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { applicationId } = params;

    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId: req.user.userId // Ensure application belongs to user
      },
      include: {
        internship: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                website: true,
                description: true
              }
            },
            campaign: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true
              }
            },
            skills: {
              select: {
                id: true,
                name: true
              }
            },
            tags: {
              select: {
                id: true,
                name: true
              }
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
        internship: {
          id: application.internship.id,
          title: application.internship.title,
          description: application.internship.description,
          location: application.internship.location,
          type: application.internship.type,
          stipend: application.internship.stipend,
          duration: application.internship.duration,
          deadline: application.internship.deadline,
          postedAt: application.internship.postedAt,
          isActive: application.internship.isActive,
          company: application.internship.company,
          campaign: application.internship.campaign,
          skills: application.internship.skills,
          tags: application.internship.tags
        }
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

// PUT - Update application (only cover letter and only if status is PENDING)
async function updateApplication(req: AuthenticatedStudentRequest, { params }: RouteParams) {
  try {
    const { applicationId } = params;
    const body = await req.json();
    const { coverLetter } = body;

    // Validate cover letter
    if (!coverLetter || coverLetter.trim().length < 50) {
      return NextResponse.json(
        { success: false, message: 'Cover letter must be at least 50 characters long' },
        { status: 400 }
      );
    }

    // Check if the application exists and belongs to the user
    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId: req.user.userId
      }
    });

    if (!application) {
      return NextResponse.json(
        { success: false, message: 'Application not found' },
        { status: 404 }
      );
    }

    // Allow update only if status is PENDING
    if (application.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, message: 'Only applications with PENDING status can be updated' },
        { status: 403 }
      );
    }

    // Perform the update
    const updatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: {
        coverLetter: coverLetter.trim()
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Application updated successfully',
      application: {
        id: updatedApplication.id,
        status: updatedApplication.status,
        coverLetter: updatedApplication.coverLetter,
        updatedAt: updatedApplication.updatedAt
      }
    });

  } catch (error) {
    console.error('Update application error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update application' },
      { status: 500 }
    );
  }
}

// Export handlers with auth
export const GET = (req: NextRequest, context: RouteParams) => withStudentAuth(getApplicationDetails)(req, context);
export const PUT = (req: NextRequest, context: RouteParams) => withStudentAuth(updateApplication)(req, context);