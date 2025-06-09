import { NextRequest, NextResponse } from 'next/server';
import { withPaidStudentAuth, AuthenticatedStudentRequest } from '@/middleware/studentAuth';
import prisma from '@/lib/prisma'

interface RouteParams {
  params: { internshipId: string };
}

// POST - Apply to internship
async function applyToInternship(req: AuthenticatedStudentRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { internshipId } = params;
    const body = await req.json();
    const { coverLetter } = body;

    // Validate cover letter
    if (!coverLetter || coverLetter.trim().length < 50) {
      return NextResponse.json(
        { success: false, message: 'Cover letter must be at least 50 characters long' },
        { status: 400 }
      );
    }

    if (coverLetter.length > 2000) {
      return NextResponse.json(
        { success: false, message: 'Cover letter must be less than 2000 characters' },
        { status: 400 }
      );
    }

    // Check if internship exists and is available
    const internship = await prisma.internship.findUnique({
      where: { id: internshipId },
      include: {
        company: {
          select: {
            name: true
          }
        },
        campaign: {
          select: {
            status: true,
            endDate: true
          }
        }
      }
    });

    if (!internship) {
      return NextResponse.json(
        { success: false, message: 'Internship not found' },
        { status: 404 }
      );
    }

    if (!internship.isActive) {
      return NextResponse.json(
        { success: false, message: 'This internship is no longer accepting applications' },
        { status: 400 }
      );
    }

    if (internship.campaign.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, message: 'This internship campaign is no longer active' },
        { status: 400 }
      );
    }

    if (new Date() > internship.deadline) {
      return NextResponse.json(
        { success: false, message: 'Application deadline has passed' },
        { status: 400 }
      );
    }

    // Check if user already applied
    const existingApplication = await prisma.application.findUnique({
      where: {
        internshipId_userId: {
          internshipId: internshipId,
          userId: req.user.userId
        }
      }
    });

    if (existingApplication) {
      return NextResponse.json(
        { success: false, message: 'You have already applied to this internship' },
        { status: 400 }
      );
    }

    // Check user's subscription and application limits (if any)
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        subscriptions: {
          where: {
            status: 'ACTIVE',
            endsAt: {
              gte: new Date()
            }
          },
          include: {
            plan: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });

    if (!user?.subscriptions[0]) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Active subscription required to apply for internships',
          requiresSubscription: true 
        },
        { status: 403 }
      );
    }

    const activePlan = user.subscriptions[0].plan;

    // Check monthly application limit if plan has one
    if (activePlan.maxApplicationsPerMonth) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const applicationsThisMonth = await prisma.application.count({
        where: {
          userId: req.user.userId,
          createdAt: {
            gte: startOfMonth
          }
        }
      });

      if (applicationsThisMonth >= activePlan.maxApplicationsPerMonth) {
        return NextResponse.json(
          { 
            success: false, 
            message: `You have reached your monthly application limit of ${activePlan.maxApplicationsPerMonth}. Upgrade your plan for more applications.`,
            limitReached: true,
            currentPlan: activePlan.name,
            applicationsUsed: applicationsThisMonth,
            applicationLimit: activePlan.maxApplicationsPerMonth
          },
          { status: 403 }
        );
      }
    }

    // Create application
    const application = await prisma.application.create({
      data: {
        internshipId: internshipId,
        userId: req.user.userId,
        coverLetter: coverLetter.trim(),
        status: 'PENDING'
      },
      include: {
        internship: {
          select: {
            title: true,
            company: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Application submitted successfully!',
      application: {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
        internship: {
          title: application.internship.title,
          company: application.internship.company.name
        }
      }
    });

  } catch (error) {
    console.error('Apply to internship error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to submit application' },
      { status: 500 }
    );
  }
}

export const POST = (req: NextRequest, context: RouteParams) => withPaidStudentAuth(applyToInternship)(req, context);