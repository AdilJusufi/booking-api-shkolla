using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Schedules;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Menaxhimi i orareve të doktorëve nga administrata e klinikës.</summary>
[ApiController]
[Route("api/admin/doctors")]
[Authorize(Policy = Policies.ClinicAdminOnly)]
public class AdminDoctorsController : ControllerBase
{
    private readonly IClinicAdminService _clinicAdminService;

    public AdminDoctorsController(IClinicAdminService clinicAdminService)
    {
        _clinicAdminService = clinicAdminService;
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(AdminDoctorDetailDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminDoctorDetailDto>> Update(
        Guid id, UpdateDoctorRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.UpdateDoctorAsync(id, request, cancellationToken));

    [HttpPut("{id:guid}/branches")]
    [ProducesResponseType(typeof(AdminDoctorDetailDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminDoctorDetailDto>> UpdateBranches(
        Guid id, UpdateDoctorBranchesRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.UpdateDoctorBranchesAsync(id, request, cancellationToken));

    [HttpPut("{id:guid}/services")]
    [ProducesResponseType(typeof(AdminDoctorDetailDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminDoctorDetailDto>> UpdateServices(
        Guid id, UpdateDoctorServicesRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.UpdateDoctorServicesAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/deactivate")]
    [ProducesResponseType(typeof(AdminDoctorDetailDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<AdminDoctorDetailDto>> Deactivate(
        Guid id, SetDoctorActiveRequest request, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.DeactivateDoctorAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/activate")]
    [ProducesResponseType(typeof(AdminDoctorDetailDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<AdminDoctorDetailDto>> Activate(Guid id, CancellationToken cancellationToken) =>
        Ok(await _clinicAdminService.ActivateDoctorAsync(id, cancellationToken));

    [HttpPost("{id:guid}/working-schedules")]
    [ProducesResponseType(typeof(WorkingScheduleDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<WorkingScheduleDto>> AddSchedule(
        Guid id, CreateWorkingScheduleRequest request, CancellationToken cancellationToken)
    {
        var schedule = await _clinicAdminService.AddDoctorScheduleAsync(id, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, schedule);
    }

    [HttpPost("{id:guid}/unavailability")]
    [ProducesResponseType(typeof(UnavailabilityDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<UnavailabilityDto>> AddUnavailability(
        Guid id, CreateUnavailabilityRequest request, CancellationToken cancellationToken)
    {
        var unavailability = await _clinicAdminService.AddDoctorUnavailabilityAsync(id, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, unavailability);
    }
}
