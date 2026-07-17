using Microsoft.AspNetCore.Identity;

namespace Booking.Infrastructure.Identity;

/// <summary>
/// User-i i sistemit — ASP.NET Core Identity menaxhon Email, PhoneNumber, PasswordHash,
/// lockout dhe konfirmimin e email-it. Këtu shtohen vetëm fushat tona.
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string FirstName { get; set; } = null!;
    public string LastName { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
