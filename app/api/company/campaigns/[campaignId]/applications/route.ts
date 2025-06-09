import { NextRequest, NextResponse } from 'next/server';
import { withCompanyAuth, AuthenticatedCompanyRequest } from '@/middleware/companyAuth';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { campaignId: string };
}

// GET - Fetch all applications for a specific campaign
async function getCampaignApplications(req: AuthenticatedCompanyRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { campaignId } = params;
    const { searchParams } = new URL(req.url);
    
    // Query parameters for filtering and pagination
    const status = searchParams.get('status'); // PENDING, SHORTLISTED, ACCEPTED, REJECTED
    const internshipId = searchParams.get('internshipId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'createdAt'; // createdAt, status
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // asc, desc

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

    // Verify campaign belongs to company
    const campaign = await prisma.campaign.findFirst({
      where: { 
        id: campaignId,
        companyId: user.company.id
      }
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Build where clause for applications
    const whereClause: any = {
      internship: {
        campaignId: campaignId
      }
    };

    if (status) {
      whereClause.status = status;
    }

    if (internshipId) {
      whereClause.internshipId = internshipId;
    }

    // Get total count for pagination
    const totalApplications = await prisma.application.count({
      where: whereClause
    });

    // Fetch applications with pagination
    const applications = await prisma.application.findMany({
      where: whereClause,
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
            location: true,
            type: true,
            stipend: true,
            duration: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    });

    // Get application status summary
    const statusSummary = await prisma.application.groupBy({
      by: ['status'],
      where: {
        internship: {
          campaignId: campaignId
        }
      },
      _count: {
        status: true
      }
    });

    const formattedApplications = applications.map(application => ({
      id: application.id,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      student: {
        id: application.user.id,
        name: application.user.name,
        email: application.user.email,
        joinedAt: application.user.createdAt
      },
      internship: {
        id: application.internship.id,
        title: application.internship.title,
        location: application.internship.location,
        type: application.internship.type,
        stipend: application.internship.stipend,
        duration: application.internship.duration
      }
    }));

    const statusCounts = statusSummary.reduce((acc, item) => {
      acc[item.status] = item._count.status;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      success: true,
      applications: formattedApplications,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalApplications / limit),
        totalApplications,
        hasNext: page * limit < totalApplications,
        hasPrev: page > 1
      },
      summary: {
        total: totalApplications,
        pending: statusCounts.PENDING || 0,
        shortlisted: statusCounts.SHORTLISTED || 0,
        accepted: statusCounts.ACCEPTED || 0,
        rejected: statusCounts.REJECTED || 0
      }
    });

  } catch (error) {
    console.error('Get campaign applications error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}

export const GET = (req: NextRequest, context: RouteParams) => withCompanyAuth(getCampaignApplications)(req, context);