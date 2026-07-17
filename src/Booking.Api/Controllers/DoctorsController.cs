using Booking.Application.Common.Models;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Doctors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Kërkimi publik i doktorëve — pa autentifikim.</summary>
[ApiController]
[Route("api/doctors")]
[AllowAnonymous]
public class DoctorsController : ControllerBase
{
    private readonly IDoctorQueryService _doctorQueryService;
    private readonly IAvailabilityService _availabilityService;

    public DoctorsController(IDoctorQueryService doctorQueryService, IAvailabilityService availabilityService)
    {
        _doctorQueryService = doctorQueryService;
        _availabilityService = availabilityService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<DoctorDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<DoctorDto>>> Search(
        [FromQuery] DoctorSearchRequest request, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.SearchAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DoctorDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DoctorDetailsDto>> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.GetByIdAsync(id, cancellationToken));

    [HttpGet("{id:guid}/services")]
    [ProducesResponseType(typeof(IReadOnlyList<DoctorServiceDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DoctorServiceDto>>> GetServices(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.GetServicesAsync(id, cancellationToken));

    /// <summary>Slotet e lira për një doktor/degë/shërbim në një datë. Oret në orën e Prishtinës.</summary>
    [HttpGet("{id:guid}/available-slots")]
    [ProducesResponseType(typeof(IReadOnlyList<AvailableSlotDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<IReadOnlyList<AvailableSlotDto>>> GetAvailableSlots(
        Guid id, [FromQuery] AvailableSlotsQuery query, CancellationToken cancellationToken) =>
        Ok(await _availabilityService.GetAvailableSlotsAsync(id, query, cancellationToken));
}
