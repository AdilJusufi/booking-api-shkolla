using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class EmailSendAttemptConfiguration : IEntityTypeConfiguration<EmailSendAttempt>
{
    public void Configure(EntityTypeBuilder<EmailSendAttempt> builder)
    {
        builder.Property(a => a.NormalizedEmail).HasMaxLength(256).IsRequired();
        builder.Property(a => a.IpAddress).HasMaxLength(45);

        // Kontrolli i limitit për-adresë numëron rreshtat për NormalizedEmail brenda
        // një dritareje kohore — pikërisht kjo kërkesë.
        builder.HasIndex(a => new { a.NormalizedEmail, a.CreatedAt });

        // Tavani global numëron TË GJITHË rreshtat brenda ditës, pavarësisht adresës.
        builder.HasIndex(a => a.CreatedAt);
    }
}
