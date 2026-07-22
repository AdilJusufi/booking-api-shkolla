using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Clinics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>
/// Administrimi i klinikave. Rolet japin qasjen në endpoint; pronësia mbi klinikën
/// konkrete verifikohet në service (TenantAccessService) — jo vetëm me role.
/// </summary>
[ApiController]
[Route("api/admin/clinics")]
[Authorize(Policy = Policies.ClinicAdminOnly)]
public class AdminClinicsController : ControllerBase
{
    private readonly IClinicAdminService _clinicAdminService;
    private readonly ISuperAdminService _superAdminService;

    public AdminClinicsController(IClinicAdminService clinicAdminService, ISuperAdminService superAdminService)
    {
        _clinicAdminService = clinicAdminService;
        _superAdminService = superAdminService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<AdminClinicDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<AdminClinicDto>>> GetMyClinics(CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.GetMyClinicsAsync(cancellationToken));

    [HttpPost]
    [Authorize(Policy = Policies.SuperAdminOnly)]
    [ProducesResponseType(typeof(AdminClinicDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<AdminClinicDto>> Create(CreateClinicRequest request, CancellationToken cancellationToken)
    {
        var clinic = await _clinicAdminService.CreateClinicAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, clinic);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(AdminClinicDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminClinicDto>> Update(
        Guid id, UpdateClinicRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.UpdateClinicAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = Policies.SuperAdminOnly)]
    [ProducesResponseType(typeof(AdminClinicDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminClinicDto>> Approve(Guid id, CancellationToken cancellationToken) =>
        Ok(await _superAdminService.ApproveClinicAsync(id, cancellationToken));

    [HttpPost("{id:guid}/deactivate")]
    [Authorize(Policy = Policies.SuperAdminOnly)]
    [ProducesResponseType(typeof(AdminClinicDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminClinicDto>> Deactivate(Guid id, CancellationToken cancellationToken) =>
        Ok(await _superAdminService.SetClinicActiveAsync(id, false, cancellationToken));

    [HttpPost("{id:guid}/activate")]
    [Authorize(Policy = Policies.SuperAdminOnly)]
    [ProducesResponseType(typeof(AdminClinicDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminClinicDto>> Activate(Guid id, CancellationToken cancellationToken) =>
        Ok(await _superAdminService.SetClinicActiveAsync(id, true, cancellationToken));

    [HttpPost("{id:guid}/admins")]
    [Authorize(Policy = Policies.SuperAdminOnly)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> AssignAdmin(
        Guid id, AssignClinicAdminRequest request, CancellationToken cancellationToken)
    {
        await _superAdminService.AssignClinicAdminAsync(id, request, cancellationToken);
        return NoContent();
    }

    [HttpPost("{id:guid}/branches")]
    [ProducesResponseType(typeof(ClinicBranchDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<ClinicBranchDto>> AddBranch(
        Guid id, CreateBranchRequest request, CancellationToken cancellationToken)
    {
        var branch = await _clinicAdminService.AddBranchAsync(id, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, branch);
    }

    [HttpPost("{id:guid}/services")]
    [ProducesResponseType(typeof(MedicalServiceDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<MedicalServiceDto>> AddService(
        Guid id, CreateMedicalServiceRequest request, CancellationToken cancellationToken)
    {
        var service = await _clinicAdminService.AddServiceAsync(id, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, service);
    }

    [HttpPost("{id:guid}/doctors")]
    [ProducesResponseType(typeof(AdminDoctorDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<AdminDoctorDto>> AddDoctor(
        Guid id, CreateDoctorRequest request, CancellationToken cancellationToken)
    {
        var doctor = await _clinicAdminService.CreateDoctorAsync(id, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, doctor);
    }

    [HttpGet("{id:guid}/report")]
    [ProducesResponseType(typeof(ClinicReportDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<ClinicReportDto>> GetReport(
        Guid id, [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        var fromDate = from ?? DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-30);
        var toDate = to ?? DateOnly.FromDateTime(DateTime.UtcNow.Date);
        return Ok(await _clinicAdminService.GetReportAsync(id, fromDate, toDate, cancellationToken));
    }
}
