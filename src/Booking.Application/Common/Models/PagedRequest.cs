namespace Booking.Application.Common.Models;

/// <summary>Baza e çdo kërkese me pagination.</summary>
public abstract record PagedRequest
{
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}
