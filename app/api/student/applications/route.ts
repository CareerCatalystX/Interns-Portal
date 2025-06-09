import { NextResponse } from 'next/server';
import { withStudentAuth, AuthenticatedStudentRequest } from '@/middleware/studentAuth';
import prisma from '@/lib/prisma'

// GET - Get all user's applications with status
async function getMyApplications(req: AuthenticatedStudentRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Query parameters
    const status = searchParams.get('status'); // PENDING, SHORTLISTED, ACCEPTED, REJECTED
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'createdAt'; // createdAt, updatedAt
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause
    const whereClause: any = {
      userId: req.user.userId
    };

    if (status && ['PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'].includes(status)) {
      whereClause.status = status;
    }

    // Get total count
    const totalApplications = await prisma.application.count({
      where: whereClause
    });

    // Fetch applications
    const applications = await prisma.application.findMany({
      where: whereClause,
      include: {
        internship: {
          select: {
            id: true,
            title: true,
            location: true,
            type: true,
            stipend: true,
            duration: true,
            deadline: true,
            isActive: true,
            company: {
              select: {
                id: true,
                name: true,
                logoUrl: true
              }
            },
            campaign: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    });

    const formattedApplications = applications.map(application => ({
      id: application.id,
      status: application.status,
      coverLetter: application.coverLetter,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      internship: {
        id: application.internship.id,
        title: application.internship.title,
        location: application.internship.location,
        type: application.internship.type,
        stipend: application.internship.stipend,
        duration: application.internship.duration,
        deadline: application.internship.deadline,
        isActive: application.internship.isActive,
        company: application.internship.company,
        campaign: application.internship.campaign
      }
    }));

    // Get status summary
    const statusSummary = await prisma.application.groupBy({
      by: ['status'],
      where: {
        userId: req.user.userId
      },
      _count: {
        status: true
      }
    });

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
    console.error('Get applications error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}

export const GET = withStudentAuth(getMyApplications);