using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Application.Features.Schedules;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Vetë-menaxhimi i orarit nga doktori i kyçur (roli Doctor).</summary>
[ApiController]
[Route("api/doctor")]
[Authorize(Policy = Policies.DoctorOnly)]
public class DoctorScheduleController : ControllerBase
{
    private readonly IScheduleService _scheduleService;
    private readonly ICurrentUserService _currentUser;

    public DoctorScheduleController(IScheduleService scheduleService, ICurrentUserService currentUser)
    {
        _scheduleService = scheduleService;
        _currentUser = currentUser;
    }

    [HttpGet("working-schedules")]
    [ProducesResponseType(typeof(IReadOnlyList<WorkingScheduleDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<WorkingScheduleDto>>> GetSchedules(CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        return Ok(await _scheduleService.GetSchedulesAsync(doctorId, cancellationToken));
    }

    [HttpPost("working-schedules")]
    [ProducesResponseType(typeof(WorkingScheduleDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<WorkingScheduleDto>> AddSchedule(
        CreateWorkingScheduleRequest request, CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        var schedule = await _scheduleService.AddScheduleAsync(doctorId, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, schedule);
    }

    [HttpDelete("working-schedules/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeactivateSchedule(Guid id, CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        await _scheduleService.DeactivateScheduleAsync(doctorId, id, cancellationToken);
        return NoContent();
    }

    [HttpGet("unavailability")]
    [ProducesResponseType(typeof(IReadOnlyList<UnavailabilityDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<UnavailabilityDto>>> GetUnavailabilities(
        [FromQuery] DateOnly? from, [FromQuery] DateOnly? to, CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        var fromDate = from ?? DateOnly.FromDateTime(DateTime.UtcNow.Date);
        var toDate = to ?? fromDate.AddDays(30);
        return Ok(await _scheduleService.GetUnavailabilitiesAsync(doctorId, fromDate, toDate, cancellationToken));
    }

    [HttpPost("unavailability")]
    [ProducesResponseType(typeof(UnavailabilityDto), StatusCodes.Status201Created)]
    public async Task<ActionResult<UnavailabilityDto>> AddUnavailability(
        CreateUnavailabilityRequest request, CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        var unavailability = await _scheduleService.AddUnavailabilityAsync(doctorId, request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, unavailability);
    }

    [HttpDelete("unavailability/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> DeleteUnavailability(Guid id, CancellationToken cancellationToken)
    {
        var doctorId = await ResolveDoctorIdAsync(cancellationToken);
        await _scheduleService.DeleteUnavailabilityAsync(doctorId, id, cancellationToken);
        return NoContent();
    }

    private async Task<Guid> ResolveDoctorIdAsync(CancellationToken cancellationToken)
    {
        var userId = _currentUser.UserId ?? throw new AuthenticationFailedException();
        return await _scheduleService.GetDoctorIdForUserAsync(userId, cancellationToken);
    }
}
