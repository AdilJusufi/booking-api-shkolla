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
