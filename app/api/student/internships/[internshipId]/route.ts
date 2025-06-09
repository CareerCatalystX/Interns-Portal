import { NextRequest, NextResponse } from 'next/server';
import { withPaidStudentAuth, AuthenticatedStudentRequest } from '@/middleware/studentAuth';
import prisma from '@/lib/prisma'

interface RouteParams {
  params: { internshipId: string };
}

// GET - Get specific internship details
async function getInternshipDetails(req: AuthenticatedStudentRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { internshipId } = params;

    // Fetch internship with full details
    const internship = await prisma.internship.findUnique({
      where: { 
        id: internshipId,
        isActive: true,
        deadline: {
          gte: new Date()
        }
      },
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
            endDate: true,
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
        },
        applications: {
          where: {
            userId: req.user.userId
          },
          select: {
            id: true,
            status: true,
            coverLetter: true,
            createdAt: true,
            updatedAt: true
          }
        },
        _count: {
          select: {
            applications: true
          }
        }
      }
    });

    if (!internship) {
      return NextResponse.json(
        { success: false, message: 'Internship not found or no longer available' },
        { status: 404 }
      );
    }

    // Check if campaign is active
    if (internship.campaign.status !== 'ACTIVE') {
      return NextResponse.json(
        { success: false, message: 'This internship is no longer accepting applications' },
        { status: 400 }
      );
    }

    // Get similar internships (same company or similar skills)
    const similarInternships = await prisma.internship.findMany({
      where: {
        id: { not: internshipId },
        isActive: true,
        deadline: { gte: new Date() },
        OR: [
          { companyId: internship.companyId },
          {
            skills: {
              some: {
                id: {
                  in: internship.skills.map(skill => skill.id)
                }
              }
            }
          }
        ]
      },
      include: {
        company: {
          select: {
            name: true,
            logoUrl: true
          }
        },
        skills: {
          select: {
            name: true
          }
        }
      },
      take: 5,
      orderBy: { postedAt: 'desc' }
    });

    const response = {
      id: internship.id,
      title: internship.title,
      description: internship.description,
      location: internship.location,
      type: internship.type,
      stipend: internship.stipend,
      duration: internship.duration,
      postedAt: internship.postedAt,
      deadline: internship.deadline,
      company: internship.company,
      campaign: internship.campaign,
      skills: internship.skills,
      tags: internship.tags,
      applicationCount: internship._count.applications,
      userApplication: internship.applications[0] || null,
      hasApplied: internship.applications.length > 0,
      canApply: internship.applications.length === 0 && new Date() < internship.deadline,
      similarInternships: similarInternships.map(similar => ({
        id: similar.id,
        title: similar.title,
        company: similar.company,
        location: similar.location,
        type: similar.type,
        stipend: similar.stipend,
        deadline: similar.deadline,
        skills: similar.skills.map(s => s.name)
      }))
    };

    return NextResponse.json({
      success: true,
      internship: response
    });

  } catch (error) {
    console.error('Get internship details error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch internship details' },
      { status: 500 }
    );
  }
}

export const GET = (req: NextRequest, context: RouteParams) => withPaidStudentAuth(getInternshipDetails)(req, context);