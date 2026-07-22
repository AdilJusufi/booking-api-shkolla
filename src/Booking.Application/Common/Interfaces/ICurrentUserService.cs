namespace Booking.Application.Common.Interfaces;

/// <summary>Përdoruesi i kyçur aktualisht — nxirret nga JWT claims në shtresën API.</summary>
public interface ICurrentUserService
{
    Guid? UserId { get; }
    string? IpAddress { get; }

    /// <summary>User-Agent i kërkesës — ruhet te refresh token për gjurmim pajisjesh.</summary>
    string? DeviceInfo { get; }

    bool IsInRole(string role);
}
