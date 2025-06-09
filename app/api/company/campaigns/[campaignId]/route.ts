import { NextResponse, NextRequest } from 'next/server';
import { withCompanyAuth, AuthenticatedCompanyRequest } from '@/middleware/companyAuth';
import prisma from '@/lib/prisma';

interface RouteParams {
  params: { campaignId: string };
}

// GET - Fetch specific campaign details
async function getCampaign(req: AuthenticatedCompanyRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { campaignId } = params;

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

    // Fetch campaign with all related data
    const campaign = await prisma.campaign.findFirst({
      where: { 
        id: campaignId,
        companyId: user.company.id // Ensure campaign belongs to user's company
      },
      include: {
        payment: true,
        internships: {
          include: {
            applications: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            },
            skills: true,
            tags: true,
            _count: {
              select: { applications: true }
            }
          }
        },
        _count: {
          select: { internships: true }
        }
      }
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }

    const formattedCampaign = {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      budget: campaign.budget,
      status: campaign.status,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      maxInternships: campaign.maxInternships,
      currentInternships: campaign._count.internships,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      payment: {
        status: campaign.payment?.status,
        amount: campaign.payment?.amount,
        paidAt: campaign.payment?.paidAt,
        paymentMethod: campaign.payment?.paymentMethod,
        transactionId: campaign.payment?.transactionId
      },
      internships: campaign.internships.map(internship => ({
        id: internship.id,
        title: internship.title,
        description: internship.description,
        location: internship.location,
        type: internship.type,
        stipend: internship.stipend,
        duration: internship.duration,
        isActive: internship.isActive,
        postedAt: internship.postedAt,
        deadline: internship.deadline,
        applicationCount: internship._count.applications,
        skills: internship.skills,
        tags: internship.tags
      }))
    };

    return NextResponse.json({
      success: true,
      campaign: formattedCampaign
    });

  } catch (error) {
    console.error('Get campaign error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch campaign' },
      { status: 500 }
    );
  }
}

// PUT - Edit campaign details
async function editCampaign(req: AuthenticatedCompanyRequest, context: RouteParams) {
  try {
    const params = await context.params;
    const { campaignId } = params;
    const body = await req.json();
    const { title, description, endDate, status } = body;

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

    // Check if campaign exists and belongs to company
    const existingCampaign = await prisma.campaign.findFirst({
      where: { 
        id: campaignId,
        companyId: user.company.id
      }
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { success: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Prepare update data (only include fields that are provided)
    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (endDate) updateData.endDate = new Date(endDate);
    if (status && ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(status)) {
      updateData.status = status;
    }

    // Update campaign
    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: updateData,
      include: {
        payment: true,
        _count: {
          select: { internships: true }
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Campaign updated successfully',
      campaign: {
        id: updatedCampaign.id,
        title: updatedCampaign.title,
        description: updatedCampaign.description,
        budget: updatedCampaign.budget,
        status: updatedCampaign.status,
        startDate: updatedCampaign.startDate,
        endDate: updatedCampaign.endDate,
        maxInternships: updatedCampaign.maxInternships,
        currentInternships: updatedCampaign._count.internships,
        updatedAt: updatedCampaign.updatedAt
      }
    });

  } catch (error) {
    console.error('Edit campaign error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update campaign' },
      { status: 500 }
    );
  }
}

export const GET = (req: NextRequest, context: RouteParams) => withCompanyAuth(getCampaign)(req, context);
export const PUT = (req: NextRequest, context: RouteParams) => withCompanyAuth(editCampaign)(req, context);