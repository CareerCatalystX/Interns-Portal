import { NextResponse } from 'next/server';
import { withPaidStudentAuth, AuthenticatedStudentRequest } from '@/middleware/studentAuth';
import prisma from '@/lib/prisma'

// GET - Fetch all accessible internships (paid students only)
async function getInternships(req: AuthenticatedStudentRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    // Query parameters for filtering and pagination
    const type = searchParams.get('type'); // REMOTE, IN_OFFICE, HYBRID
    const location = searchParams.get('location');
    const minStipend = searchParams.get('minStipend');
    const maxStipend = searchParams.get('maxStipend');
    const skills = searchParams.get('skills')?.split(','); // comma-separated skill names
    const tags = searchParams.get('tags')?.split(','); // comma-separated tag names
    const search = searchParams.get('search'); // search in title, description, company name
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const sortBy = searchParams.get('sortBy') || 'postedAt'; // postedAt, deadline, stipend
    const sortOrder = searchParams.get('sortOrder') || 'desc'; // asc, desc

    // Build where clause
    const whereClause: any = {
      isActive: true,
      deadline: {
        gte: new Date() // Only show internships with future deadlines
      },
      campaign: {
        status: 'ACTIVE' // Only show internships from active campaigns
      }
    };

    // Filter by type
    if (type && ['REMOTE', 'IN_OFFICE', 'HYBRID'].includes(type)) {
      whereClause.type = type;
    }

    // Filter by location (case-insensitive partial match)
    if (location) {
      whereClause.location = {
        contains: location,
        mode: 'insensitive'
      };
    }

    // Filter by stipend range
    if (minStipend || maxStipend) {
      whereClause.stipend = {};
      if (minStipend) whereClause.stipend.gte = parseInt(minStipend);
      if (maxStipend) whereClause.stipend.lte = parseInt(maxStipend);
    }

    // Filter by skills
    if (skills && skills.length > 0) {
      whereClause.skills = {
        some: {
          name: {
            in: skills,
            mode: 'insensitive'
          }
        }
      };
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      whereClause.tags = {
        some: {
          name: {
            in: tags,
            mode: 'insensitive'
          }
        }
      };
    }

    // Search in title, description, or company name
    if (search) {
      whereClause.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          description: {
            contains: search,
            mode: 'insensitive'
          }
        },
        {
          company: {
            name: {
              contains: search,
              mode: 'insensitive'
            }
          }
        }
      ];
    }

    // Get total count for pagination
    const totalInternships = await prisma.internship.count({
      where: whereClause
    });

    // Fetch internships
    const internships = await prisma.internship.findMany({
      where: whereClause,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            website: true
          }
        },
        campaign: {
          select: {
            id: true,
            title: true,
            endDate: true
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
            createdAt: true
          }
        },
        _count: {
          select: {
            applications: true
          }
        }
      },
      orderBy: {
        [sortBy]: sortOrder as 'asc' | 'desc'
      },
      skip: (page - 1) * limit,
      take: limit
    });

    // Format response
    const formattedInternships = internships.map(internship => ({
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
      campaign: {
        id: internship.campaign.id,
        title: internship.campaign.title,
        endDate: internship.campaign.endDate
      },
      skills: internship.skills,
      tags: internship.tags,
      applicationCount: internship._count.applications,
      userApplication: internship.applications[0] || null, // Student's application if exists
      hasApplied: internship.applications.length > 0
    }));

    // Get filter options for frontend
    const [skillOptions, tagOptions, locationOptions] = await Promise.all([
      prisma.skill.findMany({
        where: {
          internships: {
            some: whereClause
          }
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      }),
      prisma.tag.findMany({
        where: {
          internships: {
            some: whereClause
          }
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      }),
      prisma.internship.findMany({
        where: whereClause,
        select: { location: true },
        distinct: ['location'],
        orderBy: { location: 'asc' }
      })
    ]);

    return NextResponse.json({
      success: true,
      internships: formattedInternships,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalInternships / limit),
        totalInternships,
        hasNext: page * limit < totalInternships,
        hasPrev: page > 1
      },
      filters: {
        skills: skillOptions,
        tags: tagOptions,
        locations: locationOptions.map(l => l.location),
        types: ['REMOTE', 'IN_OFFICE', 'HYBRID']
      }
    });

  } catch (error) {
    console.error('Get internships error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch internships' },
      { status: 500 }
    );
  }
}

export const GET = withPaidStudentAuth(getInternships);